/**
 * Deterministic GCS object keys for the raw archive (v1). No I/O — bucket name comes from Terraform.
 * @see docs/architecture/gcs-source-archive-v1.md
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONTENT_ID = /^[a-f0-9]{32}$/;

function assertIsoDate(observedDate: string): void {
  if (!ISO_DATE.test(observedDate)) {
    throw new Error(`observedDate must be YYYY-MM-DD, got: ${observedDate}`);
  }
}

function assertSourceContentId(sourceContentId: string): void {
  if (!CONTENT_ID.test(sourceContentId)) {
    throw new Error(`sourceContentId must be 32 lowercase hex chars, got: ${sourceContentId}`);
  }
}

function assertSourceId(sourceId: string): void {
  if (!sourceId || sourceId.includes('/') || sourceId.includes('\\')) {
    throw new Error(`sourceId must be non-empty and path-safe, got: ${sourceId}`);
  }
}

export type RawArchiveExtension = 'html' | 'pdf' | 'json' | 'xml' | 'bin';

/**
 * Raw snapshot: `raw/source/{sourceId}/date={date}/{sourceContentId}.{ext}`
 */
export function buildRawSourceObjectKey(params: {
  sourceId: string;
  observedDate: string;
  sourceContentId: string;
  extension: RawArchiveExtension;
}): string {
  assertSourceId(params.sourceId);
  assertIsoDate(params.observedDate);
  assertSourceContentId(params.sourceContentId);
  return `raw/source/${params.sourceId}/date=${params.observedDate}/${params.sourceContentId}.${params.extension}`;
}

/**
 * Normalized text: `normalized/source/{sourceId}/date={date}/{sourceContentId}.txt`
 */
export function buildNormalizedTextObjectKey(params: {
  sourceId: string;
  observedDate: string;
  sourceContentId: string;
}): string {
  assertSourceId(params.sourceId);
  assertIsoDate(params.observedDate);
  assertSourceContentId(params.sourceContentId);
  return `normalized/source/${params.sourceId}/date=${params.observedDate}/${params.sourceContentId}.txt`;
}

/**
 * Manifest sidecar: `manifests/source/{sourceId}/date={date}/{sourceContentId}.manifest.json`
 */
export function buildManifestObjectKey(params: {
  sourceId: string;
  observedDate: string;
  sourceContentId: string;
}): string {
  assertSourceId(params.sourceId);
  assertIsoDate(params.observedDate);
  assertSourceContentId(params.sourceContentId);
  return `manifests/source/${params.sourceId}/date=${params.observedDate}/${params.sourceContentId}.manifest.json`;
}

/** Full `gs://` URI for a bucket + object key. */
export function buildGsUri(bucketName: string, objectKey: string): string {
  const trimmed = objectKey.replace(/^\/+/, '');
  return `gs://${bucketName}/${trimmed}`;
}
