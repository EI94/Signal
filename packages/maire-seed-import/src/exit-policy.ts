/**
 * When to exit with non-zero: apply with any invalid (no writes should proceed past validation),
 * or dry-run with `--strict` and any invalid (CI gate).
 */
export function shouldExitFailure(invalidTotal: number, apply: boolean, strict: boolean): boolean {
  return invalidTotal > 0 && (apply || strict);
}
