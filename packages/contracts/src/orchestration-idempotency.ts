import { createHash } from 'node:crypto';

/** Segments joined for stable keys; keep version prefix for forward evolution. */
export const ORCHESTRATION_KEY_VERSION = 'v1' as const;

/**
 * Deterministic 32-hex key from ordered segments (same inputs → same key across retries).
 */
export function buildOrchestrationIdempotencyKey(segments: readonly string[]): string {
  return createHash('sha256')
    .update([ORCHESTRATION_KEY_VERSION, ...segments].join(':'))
    .digest('hex')
    .slice(0, 32);
}

/** One Pub/Sub handoff message per persisted SourceContent (dedupe surface for subscribers). */
export function buildSourceContentHandoffIdempotencyKey(sourceContentId: string): string {
  return buildOrchestrationIdempotencyKey(['handoff', 'source_content_persisted', sourceContentId]);
}

/**
 * Scheduled ingest window key — caller supplies a stable `windowStartIso` (e.g. scheduler fire time bucket).
 */
export function buildScheduledIngestRunIdempotencyKey(params: {
  scope: 'all' | 'single';
  sourceId?: string;
  windowStartIso: string;
}): string {
  return buildOrchestrationIdempotencyKey([
    'ingest_run',
    params.scope,
    params.sourceId ?? '_all',
    params.windowStartIso,
  ]);
}
