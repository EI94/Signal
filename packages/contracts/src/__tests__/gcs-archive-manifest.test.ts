import { describe, expect, it } from 'vitest';
import { ArchiveManifestSchema } from '../gcs-archive-manifest';

describe('ArchiveManifestSchema', () => {
  it('parses example-shaped manifest', () => {
    const r = ArchiveManifestSchema.safeParse({
      schema_version: 'gcs-archive-manifest-v1',
      source_id: 'src_example_001',
      source_content_id: 'a1b2c3d4e5f6789012345678abcdef01',
      observed_date: '2026-04-04',
      artifacts: [
        {
          kind: 'raw',
          relative_key:
            'raw/source/src_example_001/date=2026-04-04/a1b2c3d4e5f6789012345678abcdef01.html',
          content_type: 'text/html',
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});
