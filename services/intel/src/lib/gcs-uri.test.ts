import { describe, expect, it } from 'vitest';
import { parseGcsUri } from './gcs-uri';

describe('parseGcsUri', () => {
  it('parses bucket and key', () => {
    const { bucket, objectKey } = parseGcsUri('gs://my-bucket/path/to/file.txt');
    expect(bucket).toBe('my-bucket');
    expect(objectKey).toBe('path/to/file.txt');
  });

  it('throws on invalid uri', () => {
    expect(() => parseGcsUri('https://example.com/x')).toThrow(/Invalid/);
  });
});
