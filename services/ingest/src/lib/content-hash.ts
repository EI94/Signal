import { createHash } from 'node:crypto';

/**
 * Normalize response bytes for a stable SHA-256 fingerprint at the fetch boundary.
 * - Text-like MIME: UTF-8 decode, CRLF → LF, trim trailing whitespace only at end of string.
 * - Binary (pdf, octet-stream, etc.): raw bytes unchanged.
 */
export function normalizeBodyForFingerprint(
  arrayBuffer: ArrayBuffer,
  contentType: string | null,
): Uint8Array {
  const ct = (contentType ?? '').toLowerCase();
  const isTextLike =
    ct.startsWith('text/') ||
    ct.includes('json') ||
    ct.includes('xml') ||
    ct.includes('html') ||
    ct.includes('javascript') ||
    ct.includes('rss') ||
    ct.includes('atom');

  if (isTextLike) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer);
    const normalized = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\uFEFF/g, '');
    return new TextEncoder().encode(normalized);
  }

  return new Uint8Array(arrayBuffer);
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
