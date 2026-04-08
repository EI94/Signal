#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { shouldExitFailure } from './exit-policy';
import { runMaireSeedImport, totalInvalidCount } from './run-import';

/** Monorepo-relative default CSVs (override with --file-*). */
function defaultCsvPath(filename: string): string | undefined {
  const candidates = [
    resolve(process.cwd(), 'data', 'maire', filename),
    resolve(process.cwd(), '..', '..', 'data', 'maire', filename),
  ];
  return candidates.find((p) => existsSync(p));
}

function printReport(report: Awaited<ReturnType<typeof runMaireSeedImport>>, apply: boolean): void {
  const mode = apply ? 'apply' : 'dry-run';
  console.log(`MAIRE CSV seed import (${mode})\n`);
  for (const section of ['entities', 'sources', 'watchlists'] as const) {
    const c = report[section];
    console.log(
      `${section}: read=${c.read} invalid=${c.invalid} created=${c.created} updated=${c.updated}`,
    );
  }
  const inv = totalInvalidCount(report);
  console.log(`total invalid rows: ${inv}`);
  if (report.issues.length > 0) {
    console.log('\nIssues:');
    for (const i of report.issues) {
      console.log(`  [${i.scope}] ${i.detail}`);
    }
  }
}

async function main(): Promise<void> {
  /** pnpm `run seed -- ...` may forward a standalone `--` token; strip it so parseArgs does not treat it as a positional. */
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const { values } = parseArgs({
    args,
    options: {
      workspace: { type: 'string' },
      apply: { type: 'boolean', default: false },
      strict: { type: 'boolean', default: false },
      'created-by': { type: 'string', default: 'seed:maire-csv-v1' },
      'seed-label': { type: 'string', default: 'maire_csv_v1' },
      'file-entities': { type: 'string' },
      'file-sources': { type: 'string' },
      'file-watchlists': { type: 'string' },
      'database-id': { type: 'string' },
    },
    allowPositionals: false,
  });

  const workspaceId = values.workspace;
  if (!workspaceId || workspaceId.trim() === '') {
    console.error('Missing required --workspace <id>');
    process.exit(2);
  }

  const fe = values['file-entities'] ?? defaultCsvPath('Entities.csv');
  const fs = values['file-sources'] ?? defaultCsvPath('Sources.csv');
  const fw = values['file-watchlists'] ?? defaultCsvPath('Watchlists.csv');
  if (!fe || !fs || !fw) {
    console.error(
      'Could not resolve CSV paths. Either place files in data/maire/ or pass --file-entities --file-sources --file-watchlists.',
    );
    process.exit(2);
  }
  console.log(`CSV paths:\n  entities:   ${fe}\n  sources:    ${fs}\n  watchlists: ${fw}\n`);

  const effectiveApply = values.apply === true;
  const strict = values.strict === true;

  const databaseId = values['database-id'] ?? process.env.FIRESTORE_DATABASE_ID ?? '(default)';

  let db: Parameters<typeof runMaireSeedImport>[0]['db'] = null;
  if (effectiveApply) {
    const { getFirestore } = await import('firebase-admin/firestore');
    const admin = (await import('firebase-admin')).default;
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    db = getFirestore(admin.app(), databaseId);
    console.log(
      `Firestore: project=${admin.app().options.projectId ?? '(auto)'}, database=${databaseId}`,
    );
  }

  const report = await runMaireSeedImport({
    workspaceId: workspaceId.trim(),
    files: {
      entities: fe,
      sources: fs,
      watchlists: fw,
    },
    apply: effectiveApply,
    createdBy: values['created-by'] ?? 'seed:maire-csv-v1',
    seedLabel: values['seed-label'] ?? 'maire_csv_v1',
    now: new Date(),
    db,
  });

  printReport(report, effectiveApply);

  const invalidTotal = totalInvalidCount(report);
  if (shouldExitFailure(invalidTotal, effectiveApply, strict)) {
    process.exit(1);
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
