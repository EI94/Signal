import type { ApiRuntimeConfig } from '@signal/config';
import {
  CreateWatchlistRequestSchema,
  DeleteWatchlistResponseSchema,
  UpdateWatchlistRequestSchema,
  WatchlistDetailV1ResponseSchema,
  WatchlistPathParamsSchema,
  WatchlistsListV1ResponseSchema,
} from '@signal/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { FieldValue } from 'firebase-admin/firestore';
import { sendErrorResponse } from '../lib/api-error';
import { getFirestoreDb } from '../lib/firebase-admin';
import {
  workspaceWatchlistDocumentPath,
  workspaceWatchlistsCollectionPath,
} from '../lib/firestore/paths';
import { requireAuth } from '../plugins/auth';
import { createResolveWorkspaceMembership } from '../plugins/workspace';

export const watchlistsV1Routes: FastifyPluginAsync<{
  config: ApiRuntimeConfig;
}> = async (app, opts) => {
  const { config } = opts;
  const resolveWorkspace = createResolveWorkspaceMembership(config);
  const preAuth = [requireAuth, resolveWorkspace] as const;

  app.get('/watchlists', { preHandler: [...preAuth] }, async (request, reply) => {
    const wc = request.workspaceContext;
    const uid = request.authUser?.uid;
    if (!wc || !uid) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Missing context');
      return;
    }
    const db = getFirestoreDb();
    const col = db.collection(workspaceWatchlistsCollectionPath(wc.id));
    const snap = await col.where('createdBy', '==', uid).orderBy('updatedAt', 'desc').get();

    const watchlists = snap.docs.map((d) => {
      const data = d.data();
      const entityRefs = Array.isArray(data.entityRefs) ? data.entityRefs : [];
      return {
        watchlistId: d.id,
        name: data.name ?? '',
        description: data.description,
        entityCount: entityRefs.length,
        isDefault: data.isDefault ?? false,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });

    const body = { watchlists };
    const parsed = WatchlistsListV1ResponseSchema.safeParse(body);
    if (!parsed.success) {
      request.log.error({ issues: parsed.error.flatten() }, 'watchlists list validation failed');
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    return parsed.data;
  });

  app.get('/watchlists/:watchlistId', { preHandler: [...preAuth] }, async (request, reply) => {
    const wc = request.workspaceContext;
    const uid = request.authUser?.uid;
    if (!wc || !uid) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Missing context');
      return;
    }
    const params = WatchlistPathParamsSchema.safeParse(request.params);
    if (!params.success) {
      await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid path parameters');
      return;
    }
    const db = getFirestoreDb();
    const docRef = db.doc(workspaceWatchlistDocumentPath(wc.id, params.data.watchlistId));
    const snap = await docRef.get();
    if (!snap.exists) {
      await sendErrorResponse(reply, request, 404, 'NOT_FOUND', 'Watchlist not found');
      return;
    }
    const data = snap.data();
    if (!data) {
      await sendErrorResponse(reply, request, 404, 'NOT_FOUND', 'Watchlist not found');
      return;
    }
    if (data.createdBy !== uid) {
      await sendErrorResponse(reply, request, 403, 'FORBIDDEN', 'Not your watchlist');
      return;
    }
    const watchlist = {
      watchlistId: snap.id,
      name: data.name,
      description: data.description,
      entityRefs: data.entityRefs ?? [],
      isDefault: data.isDefault ?? false,
      createdBy: data.createdBy,
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt),
    };
    const body = { watchlist };
    const parsed = WatchlistDetailV1ResponseSchema.safeParse(body);
    if (!parsed.success) {
      request.log.error({ issues: parsed.error.flatten() }, 'watchlist detail validation failed');
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    return parsed.data;
  });

  app.post('/watchlists', { preHandler: [...preAuth] }, async (request, reply) => {
    const wc = request.workspaceContext;
    const uid = request.authUser?.uid;
    if (!wc || !uid) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Missing context');
      return;
    }
    const body = CreateWatchlistRequestSchema.safeParse(request.body);
    if (!body.success) {
      await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid request body');
      return;
    }
    const db = getFirestoreDb();
    const col = db.collection(workspaceWatchlistsCollectionPath(wc.id));
    const now = FieldValue.serverTimestamp();
    const docRef = await col.add({
      name: body.data.name,
      description: body.data.description ?? null,
      entityRefs: body.data.entityRefs,
      isDefault: false,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    });

    const created = await docRef.get();
    const d = created.data();
    if (!d) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Watchlist read-back failed');
      return;
    }
    const watchlist = {
      watchlistId: created.id,
      name: d.name,
      description: d.description,
      entityRefs: d.entityRefs ?? [],
      isDefault: false,
      createdBy: uid,
      createdAt: toIso(d.createdAt),
      updatedAt: toIso(d.updatedAt),
    };
    const out = WatchlistDetailV1ResponseSchema.safeParse({ watchlist });
    if (!out.success) {
      request.log.error({ issues: out.error.flatten() }, 'watchlist create validation failed');
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    reply.code(201);
    return out.data;
  });

  app.patch('/watchlists/:watchlistId', { preHandler: [...preAuth] }, async (request, reply) => {
    const wc = request.workspaceContext;
    const uid = request.authUser?.uid;
    if (!wc || !uid) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Missing context');
      return;
    }
    const params = WatchlistPathParamsSchema.safeParse(request.params);
    if (!params.success) {
      await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid path parameters');
      return;
    }
    const body = UpdateWatchlistRequestSchema.safeParse(request.body);
    if (!body.success) {
      await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid request body');
      return;
    }
    const db = getFirestoreDb();
    const docRef = db.doc(workspaceWatchlistDocumentPath(wc.id, params.data.watchlistId));
    const snap = await docRef.get();
    if (!snap.exists) {
      await sendErrorResponse(reply, request, 404, 'NOT_FOUND', 'Watchlist not found');
      return;
    }
    if (snap.data()?.createdBy !== uid) {
      await sendErrorResponse(reply, request, 403, 'FORBIDDEN', 'Not your watchlist');
      return;
    }
    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (body.data.name !== undefined) updates.name = body.data.name;
    if (body.data.description !== undefined) updates.description = body.data.description;
    if (body.data.entityRefs !== undefined) updates.entityRefs = body.data.entityRefs;
    await docRef.update(updates);

    const fresh = await docRef.get();
    const d = fresh.data();
    if (!d) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Watchlist read-back failed');
      return;
    }
    const watchlist = {
      watchlistId: fresh.id,
      name: d.name,
      description: d.description,
      entityRefs: d.entityRefs ?? [],
      isDefault: d.isDefault ?? false,
      createdBy: d.createdBy,
      createdAt: toIso(d.createdAt),
      updatedAt: toIso(d.updatedAt),
    };
    const out = WatchlistDetailV1ResponseSchema.safeParse({ watchlist });
    if (!out.success) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    return out.data;
  });

  app.delete('/watchlists/:watchlistId', { preHandler: [...preAuth] }, async (request, reply) => {
    const wc = request.workspaceContext;
    const uid = request.authUser?.uid;
    if (!wc || !uid) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Missing context');
      return;
    }
    const params = WatchlistPathParamsSchema.safeParse(request.params);
    if (!params.success) {
      await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid path parameters');
      return;
    }
    const db = getFirestoreDb();
    const docRef = db.doc(workspaceWatchlistDocumentPath(wc.id, params.data.watchlistId));
    const snap = await docRef.get();
    if (!snap.exists) {
      await sendErrorResponse(reply, request, 404, 'NOT_FOUND', 'Watchlist not found');
      return;
    }
    if (snap.data()?.createdBy !== uid) {
      await sendErrorResponse(reply, request, 403, 'FORBIDDEN', 'Not your watchlist');
      return;
    }
    await docRef.delete();
    const body = { deleted: true as const };
    const parsed = DeleteWatchlistResponseSchema.safeParse(body);
    if (!parsed.success) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    return parsed.data;
  });
};

function toIso(v: unknown): string {
  if (v && typeof v === 'object' && 'toDate' in v && typeof v.toDate === 'function') {
    return (v.toDate() as Date).toISOString();
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date().toISOString();
}
