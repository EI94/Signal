/** Opaque timeline keyset (WS6.3): anchor row for pagination. */
export type TimelineCursorV1 = {
  readonly v: 1;
  /** ISO instant for `detected_at` (BigQuery) or `detectedAt` (Firestore). */
  readonly detectedAt: string;
  readonly signalId: string;
};

export function encodeTimelineCursor(detectedAt: Date, signalId: string): string {
  const payload: TimelineCursorV1 = { v: 1, detectedAt: detectedAt.toISOString(), signalId };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeTimelineCursor(raw: string | undefined): TimelineCursorV1 | null {
  if (!raw || raw.trim() === '') return null;
  try {
    const buf = Buffer.from(raw, 'base64url');
    const parsed = JSON.parse(buf.toString('utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const o = parsed as Record<string, unknown>;
    if (
      o.v === 1 &&
      typeof o.detectedAt === 'string' &&
      typeof o.signalId === 'string' &&
      o.signalId.length >= 1
    ) {
      return { v: 1, detectedAt: o.detectedAt, signalId: o.signalId };
    }
  } catch {
    return null;
  }
  return null;
}
