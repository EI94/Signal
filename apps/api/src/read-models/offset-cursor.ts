/**
 * Minimal deterministic pagination: offset into an ordered, bounded in-memory list (see read-models-v1.md).
 */
export type OffsetCursorPayload = { readonly v: 1; readonly o: number };

export function encodeOffsetCursor(offset: number): string {
  const payload: OffsetCursorPayload = { v: 1, o: offset };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeOffsetCursor(raw: string | undefined): number {
  if (!raw || raw.trim() === '') return 0;
  try {
    const buf = Buffer.from(raw, 'base64url');
    const parsed = JSON.parse(buf.toString('utf8')) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as OffsetCursorPayload).v === 1 &&
      typeof (parsed as OffsetCursorPayload).o === 'number' &&
      Number.isInteger((parsed as OffsetCursorPayload).o) &&
      (parsed as OffsetCursorPayload).o >= 0
    ) {
      return (parsed as OffsetCursorPayload).o;
    }
  } catch {
    return 0;
  }
  return 0;
}
