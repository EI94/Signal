import { createHash } from 'node:crypto';
import type { IngestRuntimeConfig } from '@signal/config';
import {
  ArchiveManifestSchema,
  buildGsUri,
  buildManifestObjectKey,
  buildRawSourceObjectKey,
  deriveSourceContentId,
  type SourceRegistryDocument,
} from '@signal/contracts';
import { insertSourceContentRow, type SourceContentsRow } from './bigquery-insert';
import { uploadObjectBytes } from './gcs-upload';
import { inferRawArchiveExtension } from './infer-raw-extension';
import { registrySourceTypeToContentRecordType } from './map-content-record-type';

function sha256HexOfBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type ArchivePersistenceResult = {
  sourceContentId: string;
  rawObjectKey: string;
  manifestObjectKey: string;
  /** Primary raw object URI for BigQuery `archived_gcs_uri` and Firestore `lastArchivedGcsUri`. */
  archivedGcsUri: string;
  /** Sidecar manifest JSON in GCS (same observation date / `source_content_id`). */
  manifestGcsUri: string;
};

/**
 * Writes raw bytes + manifest to GCS, inserts BigQuery metadata row. Caller handles Firestore.
 */
export async function archiveSourceContentAndPersistRow(params: {
  config: IngestRuntimeConfig;
  source: SourceRegistryDocument;
  rawBody: ArrayBuffer;
  contentFingerprintHex: string;
  observedAt: Date;
  contentType: string | null;
  publishedAt: Date | null;
}): Promise<ArchivePersistenceResult> {
  const { source, config } = params;
  const sourceContentId = deriveSourceContentId(source.sourceId, params.contentFingerprintHex);
  const observedDate = utcDateString(params.observedAt);
  const extension = inferRawArchiveExtension(source.sourceType, params.contentType);
  const rawKey = buildRawSourceObjectKey({
    sourceId: source.sourceId,
    observedDate,
    sourceContentId,
    extension,
  });
  const rawBuf = Buffer.from(params.rawBody);
  const rawSha256 = sha256HexOfBuffer(rawBuf);

  const uploadContentType = params.contentType?.trim() || 'application/octet-stream';
  await uploadObjectBytes({
    projectId: config.firebaseProjectId,
    bucketName: config.gcsRawBucketName,
    objectKey: rawKey,
    body: rawBuf,
    contentType: uploadContentType,
  });

  const manifestKey = buildManifestObjectKey({
    sourceId: source.sourceId,
    observedDate,
    sourceContentId,
  });

  const manifest = ArchiveManifestSchema.parse({
    schema_version: 'gcs-archive-manifest-v1',
    source_id: source.sourceId,
    source_content_id: sourceContentId,
    observed_date: observedDate,
    artifacts: [
      {
        kind: 'raw',
        relative_key: rawKey,
        content_type: uploadContentType,
        sha256_hex: rawSha256,
      },
    ],
  });

  const manifestJson = `${JSON.stringify(manifest, null, 0)}\n`;
  await uploadObjectBytes({
    projectId: config.firebaseProjectId,
    bucketName: config.gcsRawBucketName,
    objectKey: manifestKey,
    body: Buffer.from(manifestJson, 'utf8'),
    contentType: 'application/json',
  });

  const archivedGcsUri = buildGsUri(config.gcsRawBucketName, rawKey);
  const manifestGcsUri = buildGsUri(config.gcsRawBucketName, manifestKey);

  const row: SourceContentsRow = {
    source_content_id: sourceContentId,
    source_id: source.sourceId,
    registry_source_type: source.sourceType,
    source_type: registrySourceTypeToContentRecordType(source.sourceType),
    mime_type: params.contentType?.trim() ? params.contentType.trim() : null,
    source_url: source.canonicalUrl,
    content_hash: params.contentFingerprintHex,
    published_at: params.publishedAt,
    observed_at: params.observedAt,
    archived_gcs_uri: archivedGcsUri,
    extraction_status: 'pending',
    language: source.parserStrategy.contentLanguageHint ?? null,
    workspace_id: config.defaultWorkspaceId,
    created_at: params.observedAt,
  };

  await insertSourceContentRow({
    projectId: config.firebaseProjectId,
    datasetId: config.bigQueryDatasetId,
    tableId: config.bigQuerySourceContentsTableId,
    row,
  });

  return {
    sourceContentId,
    rawObjectKey: rawKey,
    manifestObjectKey: manifestKey,
    archivedGcsUri,
    manifestGcsUri,
  };
}
