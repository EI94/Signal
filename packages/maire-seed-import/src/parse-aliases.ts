/** Split MAIRE-style alias lists (`a; b; c`). */
export function parseAliasCell(cell: string | undefined): string[] {
  if (cell === undefined || cell.trim() === '') return [];
  return cell
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
