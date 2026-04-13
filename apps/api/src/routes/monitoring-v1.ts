import { randomUUID } from 'node:crypto';
import type { ApiRuntimeConfig } from '@signal/config';
import {
  CatalogSourcesV1ResponseSchema,
  CreateSourceDraftRequestSchema,
  CreateSourceDraftResponseSchema,
  SOURCE_DRAFTS_SUBCOLLECTION,
  SOURCE_REGISTRY_COLLECTION,
  SuggestEntitySourcesRequestSchema,
  SuggestEntitySourcesResponseSchema,
} from '@signal/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { FieldValue } from 'firebase-admin/firestore';
import { sendErrorResponse } from '../lib/api-error';
import { getFirestoreDb } from '../lib/firebase-admin';
import { suggestInstitutionalSourcesViaGemini } from '../lib/gemini-suggest-entity-sources';
import { requireAuth } from '../plugins/auth';
import { createResolveWorkspaceMembership } from '../plugins/workspace';

const SOURCES_PAGE = 400;

export const monitoringV1Routes: FastifyPluginAsync<{ config: ApiRuntimeConfig }> = async (
  app,
  opts,
) => {
  const { config } = opts;
  const resolveWorkspace = createResolveWorkspaceMembership(config);
  const preAuth = [requireAuth, resolveWorkspace] as const;

  app.get('/catalog/sources', { preHandler: [...preAuth] }, async (request, reply) => {
    const wc = request.workspaceContext;
    if (!wc) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Missing context');
      return;
    }
    const db = getFirestoreDb();
    const snap = await db
      .collection(SOURCE_REGISTRY_COLLECTION)
      .where('isActive', '==', true)
      .limit(SOURCES_PAGE)
      .get();

    const sources = snap.docs
      .map((d) => {
        const raw = d.data() as Record<string, unknown>;
        const sourceId = d.id;
        const name = typeof raw.name === 'string' ? raw.name : '';
        const canonicalUrl = typeof raw.canonicalUrl === 'string' ? raw.canonicalUrl : '';
        const category = typeof raw.category === 'string' ? raw.category : 'other';
        const authorityScore =
          typeof raw.authorityScore === 'number' ? Math.round(raw.authorityScore) : 50;
        if (!name || !canonicalUrl) return null;
        return {
          sourceId,
          name,
          canonicalUrl,
          category,
          authorityScore: Math.min(100, Math.max(0, authorityScore)),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const body = { sources };
    const validated = CatalogSourcesV1ResponseSchema.safeParse(body);
    if (!validated.success) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    return validated.data;
  });

  app.post('/me/suggest-entity-sources', { preHandler: [...preAuth] }, async (request, reply) => {
    if (!config.geminiSuggestApiKey) {
      await sendErrorResponse(
        reply,
        request,
        503,
        'UNAVAILABLE',
        'Gemini suggestions are not configured for this environment.',
      );
      return;
    }

    const parsed = SuggestEntitySourcesRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid request body');
      return;
    }

    try {
      const suggestions = await suggestInstitutionalSourcesViaGemini({
        apiKey: config.geminiSuggestApiKey,
        model: config.geminiSuggestModel,
        request: parsed.data,
      });
      const body = { suggestions };
      const out = SuggestEntitySourcesResponseSchema.safeParse(body);
      if (!out.success) {
        await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
        return;
      }
      return out.data;
    } catch (err) {
      request.log.error({ err }, 'suggest-entity-sources failed');
      await sendErrorResponse(reply, request, 502, 'BAD_GATEWAY', 'Suggestion provider error');
    }
  });

  app.post('/me/source-drafts', { preHandler: [...preAuth] }, async (request, reply) => {
    const wc = request.workspaceContext;
    const uid = request.authUser?.uid;
    if (!wc || !uid) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Missing context');
      return;
    }

    const parsed = CreateSourceDraftRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid request body');
      return;
    }

    const draftId = randomUUID();
    const db = getFirestoreDb();
    const ref = db
      .collection('workspaces')
      .doc(wc.id)
      .collection(SOURCE_DRAFTS_SUBCOLLECTION)
      .doc(draftId);

    await ref.set({
      status: 'pending_review',
      proposedName: parsed.data.proposedName,
      proposedUrl: parsed.data.proposedUrl,
      ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
      ...(parsed.data.rationale !== undefined ? { rationale: parsed.data.rationale } : {}),
      ...(parsed.data.fromGeminiSuggestion === true ? { fromGeminiSuggestion: true } : {}),
      createdByUid: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const body = { draftId, status: 'pending_review' as const };
    const out = CreateSourceDraftResponseSchema.safeParse(body);
    if (!out.success) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    reply.code(201);
    return out.data;
  });
};
