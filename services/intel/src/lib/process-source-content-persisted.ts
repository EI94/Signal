import type { IntelRuntimeConfig } from '@signal/config';
import {
  ArchiveManifestSchema,
  buildGsUri,
  buildNormalizedTextObjectKey,
  type SourceContentExtractionStatus,
  type SourceContentPersistedEvent,
} from '@signal/contracts';
import { downloadObjectBytes } from './download-object';
import { parseGcsUri } from './gcs-uri';
import { normalizeIntelContent } from './normalize-intel-content';
import { updateSourceContentExtractionRow } from './update-source-content-extraction';
import { uploadNormalizedTextArtifact } from './write-normalized-artifact';

export type ProcessPersistDeps = {
  downloadBytes: (bucket: string, objectKey: string) => Promise<Buffer>;
  uploadNormalized: (args: { bucket: string; objectKey: string; body: Buffer }) => Promise<void>;
  updateExtractionRow: (args: {
    sourceContentId: string;
    extractionStatus: SourceContentExtractionStatus;
    normalizedGcsUri: string | null;
    extractionErrorCode: string | null;
    extractedEventCount: number | null;
  }) => Promise<void>;
};

export type ProcessSourceContentPersistedResult = {
  sourceContentId: string;
  extractionStatus: SourceContentExtractionStatus;
  normalizedGcsUri: string | null;
  extractionErrorCode: string | null;
  manifestValidated: true;
};

export async function processSourceContentPersisted(
  event: SourceContentPersistedEvent,
  config: IntelRuntimeConfig,
  deps: ProcessPersistDeps,
): Promise<ProcessSourceContentPersistedResult> {
  const archived = parseGcsUri(event.archivedGcsUri);
  const manifestLoc = parseGcsUri(event.manifestGcsUri);

  const manifestBuf = await deps.downloadBytes(manifestLoc.bucket, manifestLoc.objectKey);
  const manifest = ArchiveManifestSchema.parse(JSON.parse(manifestBuf.toString('utf8')));

  if (manifest.source_content_id !== event.sourceContentId) {
    throw new Error('manifest_source_content_id_mismatch');
  }

  const rawArtifact = manifest.artifacts.find((a) => a.kind === 'raw');
  if (!rawArtifact) {
    throw new Error('manifest_missing_raw_artifact');
  }
  if (buildGsUri(archived.bucket, rawArtifact.relative_key) !== event.archivedGcsUri) {
    throw new Error('manifest_raw_uri_mismatch');
  }

  const rawBytes = await deps.downloadBytes(archived.bucket, archived.objectKey);
  const outcome = normalizeIntelContent({
    contentRecordType: event.sourceType,
    mimeType: event.mimeType,
    rawBytes: new Uint8Array(rawBytes),
  });

  const observedDate = event.observedAt.slice(0, 10);

  if (outcome.kind === 'pdf_deferred') {
    await deps.updateExtractionRow({
      sourceContentId: event.sourceContentId,
      extractionStatus: 'awaiting_pdf_text_extraction',
      normalizedGcsUri: null,
      extractionErrorCode: null,
      extractedEventCount: null,
    });
    return {
      sourceContentId: event.sourceContentId,
      extractionStatus: 'awaiting_pdf_text_extraction',
      normalizedGcsUri: null,
      extractionErrorCode: null,
      manifestValidated: true,
    };
  }

  if (outcome.kind === 'skipped') {
    await deps.updateExtractionRow({
      sourceContentId: event.sourceContentId,
      extractionStatus: 'normalization_skipped',
      normalizedGcsUri: null,
      extractionErrorCode: outcome.code,
      extractedEventCount: null,
    });
    return {
      sourceContentId: event.sourceContentId,
      extractionStatus: 'normalization_skipped',
      normalizedGcsUri: null,
      extractionErrorCode: outcome.code,
      manifestValidated: true,
    };
  }

  if (outcome.kind === 'failed') {
    await deps.updateExtractionRow({
      sourceContentId: event.sourceContentId,
      extractionStatus: 'normalization_failed',
      normalizedGcsUri: null,
      extractionErrorCode: outcome.code,
      extractedEventCount: null,
    });
    return {
      sourceContentId: event.sourceContentId,
      extractionStatus: 'normalization_failed',
      normalizedGcsUri: null,
      extractionErrorCode: outcome.code,
      manifestValidated: true,
    };
  }

  if (!config.normalizedWritesEnabled) {
    await deps.updateExtractionRow({
      sourceContentId: event.sourceContentId,
      extractionStatus: 'normalization_skipped',
      normalizedGcsUri: null,
      extractionErrorCode: 'intel_normalized_writes_disabled',
      extractedEventCount: null,
    });
    return {
      sourceContentId: event.sourceContentId,
      extractionStatus: 'normalization_skipped',
      normalizedGcsUri: null,
      extractionErrorCode: 'intel_normalized_writes_disabled',
      manifestValidated: true,
    };
  }

  const normKey = buildNormalizedTextObjectKey({
    sourceId: event.sourceId,
    observedDate,
    sourceContentId: event.sourceContentId,
  });
  const body = Buffer.from(outcome.text, 'utf8');
  await deps.uploadNormalized({
    bucket: archived.bucket,
    objectKey: normKey,
    body,
  });
  const normalizedGcsUri = buildGsUri(archived.bucket, normKey);
  await deps.updateExtractionRow({
    sourceContentId: event.sourceContentId,
    extractionStatus: 'normalized_ready',
    normalizedGcsUri,
    extractionErrorCode: null,
    extractedEventCount: null,
  });

  return {
    sourceContentId: event.sourceContentId,
    extractionStatus: 'normalized_ready',
    normalizedGcsUri,
    extractionErrorCode: null,
    manifestValidated: true,
  };
}

export function createDefaultProcessDeps(config: IntelRuntimeConfig): ProcessPersistDeps {
  return {
    downloadBytes: (bucket, objectKey) =>
      downloadObjectBytes({ projectId: config.firebaseProjectId, bucketName: bucket, objectKey }),
    uploadNormalized: ({ bucket, objectKey, body }) =>
      uploadNormalizedTextArtifact({
        projectId: config.firebaseProjectId,
        bucketName: bucket,
        objectKey,
        body,
      }),
    updateExtractionRow: (args) =>
      updateSourceContentExtractionRow({
        projectId: config.firebaseProjectId,
        datasetId: config.bigQueryDatasetId,
        tableId: config.bigQuerySourceContentsTableId,
        ...args,
      }),
  };
}
