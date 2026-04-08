/** Shallow convert Firestore `Timestamp`-like fields to `Date` for Zod operational schemas. */
export function coerceFirestoreTimestamps<T extends Record<string, unknown>>(raw: T): T {
  const out = { ...raw };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (
      v !== null &&
      typeof v === 'object' &&
      'toDate' in v &&
      typeof (v as { toDate: () => Date }).toDate === 'function'
    ) {
      (out as Record<string, unknown>)[k] = (v as { toDate: () => Date }).toDate();
    }
  }
  return out;
}
