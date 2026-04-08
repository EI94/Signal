/** Tiny class-name concatenation. Internal to @signal/ui. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
