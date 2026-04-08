import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runMaireSeedImport } from './run-import';

describe('runMaireSeedImport watchlist invalid', () => {
  it('marks unresolved watchlist entity refs as invalid', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'maire-wl-'));
    const entities = join(dir, 'Entities.csv');
    const sources = join(dir, 'Sources.csv');
    const watchlists = join(dir, 'Watchlists.csv');

    writeFileSync(
      entities,
      `entityType,canonicalName,aliases,category,priority,notes
organization,Acme,,group_company,P0,Note
`,
      'utf8',
    );
    writeFileSync(
      sources,
      `canonicalUrl,sourceType,category,linkedEntityRefs,priorityTier,checkFrequencyBucket,authorityScore,notes
https://example.com/news,web_page,group_corporate,Acme,p0_critical,daily,100,Note
`,
      'utf8',
    );
    writeFileSync(
      watchlists,
      `watchlistName,entityType,entityIdOrCanonicalName,priority
Radar,organization,NoSuchEntity,P0
`,
      'utf8',
    );

    const report = await runMaireSeedImport({
      workspaceId: 'ws-test',
      files: { entities, sources, watchlists },
      apply: false,
      createdBy: 'test',
      seedLabel: 'test_seed',
      now: new Date('2026-01-01T00:00:00.000Z'),
      db: null,
    });

    expect(report.watchlists.invalid).toBe(1);
    expect(report.issues.some((i) => i.detail.includes('unresolved'))).toBe(true);
  });
});
