import type { EntityRef, LatestSignalDocument, SignalRow } from '@signal/contracts';
import type { Firestore } from 'firebase-admin/firestore';

function entityRefsForLatest(refs: EntityRef[] | null): EntityRef[] {
  if (!refs || refs.length === 0) return [];
  return refs;
}

const TOKEN_RE = /[a-zA-Z0-9\u00C0-\u024F]{2,}/g;
const MAX_TOKENS = 80;

/**
 * Build lowercase search tokens from title + entity display names + sourceLabel.
 * Firestore `array-contains` queries require exact element match, so these are
 * whole lowercase words (not trigrams) for simplicity and index efficiency.
 */
function buildSearchTokens(title: string, refs: EntityRef[], sourceLabel?: string): string[] {
  const parts = [title];
  for (const r of refs) {
    if (r.displayName) parts.push(r.displayName);
  }
  if (sourceLabel) parts.push(sourceLabel);

  const tokens = new Set<string>();
  for (const part of parts) {
    for (const match of part.matchAll(TOKEN_RE)) {
      tokens.add(match[0].toLowerCase());
    }
  }
  return [...tokens].slice(0, MAX_TOKENS);
}

/**
 * Minimal operational projection under `workspaces/{workspaceId}/signalsLatest/{signalId}`.
 */
export function buildLatestSignalDocument(params: {
  row: SignalRow;
  compositeScore: number;
  sourceContentId: string;
  sourceUrl?: string;
  sourceLabel?: string;
  publishedAt?: Date | null;
}): LatestSignalDocument {
  const refs = entityRefsForLatest(params.row.entity_refs_json);
  return {
    signalId: params.row.signal_id,
    signalType: params.row.signal_type,
    title: params.row.title,
    shortSummary: params.row.short_summary ?? null,
    entityRefs: refs,
    score: params.compositeScore,
    status: params.row.status,
    novelty: params.row.novelty ?? null,
    occurredAt: params.row.occurred_at,
    detectedAt: params.row.detected_at,
    provenance: {
      contentRef: params.sourceContentId,
      ...(params.sourceUrl && { sourceUrl: params.sourceUrl }),
      ...(params.sourceLabel && { sourceLabel: params.sourceLabel }),
      ...(params.publishedAt && { sourcePublishedAt: params.publishedAt }),
    },
    updatedAt: params.row.updated_at,
    searchTokens: buildSearchTokens(params.row.title, refs, params.sourceLabel),
  };
}

export async function writeSignalsLatestDocuments(params: {
  db: Firestore;
  workspaceId: string;
  documents: LatestSignalDocument[];
}): Promise<void> {
  const batch = params.db.batch();
  for (const doc of params.documents) {
    const ref = params.db
      .collection('workspaces')
      .doc(params.workspaceId)
      .collection('signalsLatest')
      .doc(doc.signalId);

    batch.set(
      ref,
      {
        ...doc,
        occurredAt: doc.occurredAt,
        detectedAt: doc.detectedAt,
        updatedAt: doc.updatedAt,
        score: doc.score,
      },
      { merge: true },
    );
  }
  await batch.commit();
}
