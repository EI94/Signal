import { describe, expect, it } from 'vitest';
import {
  buildGsUri,
  buildManifestObjectKey,
  buildNormalizedTextObjectKey,
  buildRawSourceObjectKey,
} from '../gcs-archive-paths';

describe('gcs-archive-paths', () => {
  const base = {
    sourceId: 'src_1',
    observedDate: '2026-04-04',
    sourceContentId: 'a1b2c3d4e5f6789012345678abcdef01',
  };

  it('builds deterministic raw key', () => {
    expect(buildRawSourceObjectKey({ ...base, extension: 'html' })).toBe(
      'raw/source/src_1/date=2026-04-04/a1b2c3d4e5f6789012345678abcdef01.html',
    );
  });

  it('builds normalized and manifest keys', () => {
    expect(buildNormalizedTextObjectKey(base)).toBe(
      'normalized/source/src_1/date=2026-04-04/a1b2c3d4e5f6789012345678abcdef01.txt',
    );
    expect(buildManifestObjectKey(base)).toBe(
      'manifests/source/src_1/date=2026-04-04/a1b2c3d4e5f6789012345678abcdef01.manifest.json',
    );
  });

  it('builds gs URI', () => {
    expect(buildGsUri('myproj-signal-dev-raw', 'raw/source/x/date=2026-01-01/y.html')).toBe(
      'gs://myproj-signal-dev-raw/raw/source/x/date=2026-01-01/y.html',
    );
  });

  it('rejects bad content id', () => {
    expect(() =>
      buildRawSourceObjectKey({ ...base, sourceContentId: 'short', extension: 'html' }),
    ).toThrow();
  });
});
