import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

export function readCsvRecords(path: string): Record<string, string>[] {
  const raw = readFileSync(path, 'utf8');
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  }) as Record<string, string>[];
}
