import type { IngestRuntimeConfig } from '@signal/config';
import type { IngestFetchRecord, SourceRegistryDocument } from '@signal/contracts';
import type admin from 'firebase-admin';
import { normalizeBodyForFingerprint, sha256Hex } from './content-hash';
import { decideFetchDelta } from './delta-decision';
import { fetchUrlOnce } from './fetch-client';
import { patchSourceOperationalFetchState } from './source-operational-patch';
import { shouldDeferSourceFetchByRatePolicy } from './source-rate-policy';

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function resolveTimeoutMs(source: SourceRegistryDocument, config: IngestRuntimeConfig): number {
  if (source.fetchStrategy.timeoutRetryClass === 'extended') {
    return Math.floor(config.fetchTimeoutMs * 1.5);
  }
  return config.fetchTimeoutMs;
}

export type PersistRequestPayload = {
  source: SourceRegistryDocument;
  rawBody: ArrayBuffer;
  contentFingerprintHex: string;
  observedAt: Date;
  contentType: string | null;
  lastModified: Date | null;
};

export type ProcessOneSourceResult = {
  record: IngestFetchRecord;
  /**
   * Present for `first_seen` / `changed` only. Caller runs GCS/BQ when `persistenceEnabled`, else patches hash only.
   * Do not patch `lastContentHash` / `lastArchivedGcsUri` until persistence succeeds (or persistence is off).
   */
  persistRequest?: PersistRequestPayload;
};

/**
 * Fetch one registry source. Operational patches are applied immediately except for qualifying deltas
 * that require archive persistence (handled in run-once).
 */
export async function processOneSource(
  db: admin.firestore.Firestore,
  source: SourceRegistryDocument,
  config: IngestRuntimeConfig,
): Promise<ProcessOneSourceResult> {
  const fetchedAt = new Date();
  const fetchedAtIso = fetchedAt.toISOString();

  if (source.fetchStrategy.authRequired) {
    await patchSourceOperationalFetchState(db, source.sourceId, {
      lastFetchedAt: fetchedAt,
      updatedAt: fetchedAt,
      fetchStatus: 'healthy',
      consecutiveFailures: source.consecutiveFailures ?? 0,
    });
    return {
      record: {
        sourceId: source.sourceId,
        fetchedAt: fetchedAtIso,
        deltaOutcome: 'unsupported_or_skipped',
        httpStatusCode: null,
        contentType: null,
        etag: null,
        lastModified: null,
        contentHash: null,
        byteLength: null,
        reasonCode: 'auth_required',
      },
    };
  }

  if (!isHttpUrl(source.canonicalUrl)) {
    await patchSourceOperationalFetchState(db, source.sourceId, {
      lastFetchedAt: fetchedAt,
      updatedAt: fetchedAt,
      fetchStatus: 'healthy',
      consecutiveFailures: source.consecutiveFailures ?? 0,
    });
    return {
      record: {
        sourceId: source.sourceId,
        fetchedAt: fetchedAtIso,
        deltaOutcome: 'unsupported_or_skipped',
        httpStatusCode: null,
        contentType: null,
        etag: null,
        lastModified: null,
        contentHash: null,
        byteLength: null,
        reasonCode: 'unsupported_url',
      },
    };
  }

  const rateDecision = shouldDeferSourceFetchByRatePolicy({
    now: fetchedAt,
    lastFetchedAt: source.lastFetchedAt,
    bucket: source.fetchStrategy.checkFrequencyBucket,
    policyEnabled: config.ingestRatePolicyEnabled,
  });
  if (rateDecision.defer) {
    /** Do not patch `lastFetchedAt` — deferral is not a successful fetch observation. */
    return {
      record: {
        sourceId: source.sourceId,
        fetchedAt: fetchedAtIso,
        deltaOutcome: 'unsupported_or_skipped',
        httpStatusCode: null,
        contentType: null,
        etag: null,
        lastModified: null,
        contentHash: null,
        byteLength: null,
        reasonCode: 'rate_policy_deferred',
      },
    };
  }

  const result = await fetchUrlOnce({
    url: source.canonicalUrl,
    timeoutMs: resolveTimeoutMs(source, config),
    userAgent: config.fetchUserAgent,
    maxBodyBytes: config.fetchMaxBodyBytes,
  });

  if (!result.ok) {
    const failures = (source.consecutiveFailures ?? 0) + 1;
    await patchSourceOperationalFetchState(db, source.sourceId, {
      lastFetchedAt: fetchedAt,
      updatedAt: fetchedAt,
      fetchStatus: 'failing',
      consecutiveFailures: failures,
    });
    return {
      record: {
        sourceId: source.sourceId,
        fetchedAt: fetchedAtIso,
        deltaOutcome: 'fetch_failed',
        httpStatusCode: result.statusCode,
        contentType: null,
        etag: null,
        lastModified: null,
        contentHash: null,
        byteLength: null,
        reasonCode: result.kind,
        errorMessage: result.message,
      },
    };
  }

  const ct = result.contentType;
  const normalized = normalizeBodyForFingerprint(result.body, ct);
  const fingerprintHex = sha256Hex(normalized);
  const delta = decideFetchDelta({
    newHashHex: fingerprintHex,
    previousHash: source.lastContentHash,
  });

  const baseRecord: Omit<IngestFetchRecord, 'deltaOutcome'> = {
    sourceId: source.sourceId,
    fetchedAt: fetchedAtIso,
    httpStatusCode: result.statusCode,
    contentType: ct,
    etag: result.etag,
    lastModified: result.lastModified ? result.lastModified.toISOString() : null,
    contentHash: fingerprintHex,
    byteLength: result.body.byteLength,
  };

  if (delta === 'unchanged') {
    await patchSourceOperationalFetchState(db, source.sourceId, {
      lastFetchedAt: fetchedAt,
      updatedAt: fetchedAt,
      fetchStatus: 'healthy',
      consecutiveFailures: 0,
      lastContentHash: fingerprintHex,
    });
    return {
      record: { ...baseRecord, deltaOutcome: 'unchanged' },
    };
  }

  /** `first_seen` or `changed` — defer registry hash / archive pointers until persistence completes. */
  return {
    record: { ...baseRecord, deltaOutcome: delta },
    persistRequest: {
      source,
      rawBody: result.body,
      contentFingerprintHex: fingerprintHex,
      observedAt: fetchedAt,
      contentType: ct,
      lastModified: result.lastModified,
    },
  };
}
