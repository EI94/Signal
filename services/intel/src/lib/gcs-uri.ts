/**
 * Parse `gs://bucket/object/key` into bucket + relative object key.
 */
export function parseGcsUri(uri: string): { bucket: string; objectKey: string } {
  const trimmed = uri.trim();
  const m = /^gs:\/\/([^/]+)\/(.+)$/.exec(trimmed);
  if (!m?.[1] || m[2] === undefined) {
    throw new Error(`Invalid GCS URI: ${uri}`);
  }
  return { bucket: m[1], objectKey: m[2].replace(/^\/+/, '') };
}
