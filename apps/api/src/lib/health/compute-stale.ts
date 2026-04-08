/**
 * Pure stale/fresh helpers for WS10.2 — no I/O.
 * Missing timestamp → stale (nothing observed in the window we care about).
 */
export function isStaleByAgeMs(
  nowMs: number,
  lastOccurredAtMs: number | null,
  thresholdHours: number,
): boolean {
  if (lastOccurredAtMs === null) return true;
  const ageMs = nowMs - lastOccurredAtMs;
  return ageMs > thresholdHours * 3_600_000;
}
