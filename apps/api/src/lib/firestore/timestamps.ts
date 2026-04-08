/**
 * Shallow Firestore Timestamp → Date for known operational date fields (Admin SDK `Timestamp` has `toDate()`).
 */
const TIMESTAMP_KEYS = new Set([
  'createdAt',
  'updatedAt',
  'joinedAt',
  'occurredAt',
  'detectedAt',
  'periodStart',
  'periodEnd',
  'lastReviewedAt',
  'lastFetchedAt',
]);

function toDateIfFirestoreTimestamp(value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return value;
}

export function normalizeFirestoreTimestamps<T extends Record<string, unknown>>(
  data: T,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const key of TIMESTAMP_KEYS) {
    if (key in out) {
      out[key] = toDateIfFirestoreTimestamp(out[key]);
    }
  }
  return out;
}
