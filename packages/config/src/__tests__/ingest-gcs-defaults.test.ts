import { describe, expect, it } from 'vitest';
import { defaultGcsRawBucketName, terraformEnvShortForSignal } from '../ingest-gcs-defaults';

describe('terraformEnvShortForSignal', () => {
  it('matches Terraform README bucket suffixes', () => {
    expect(terraformEnvShortForSignal('development')).toBe('dev');
    expect(terraformEnvShortForSignal('staging')).toBe('staging');
    expect(terraformEnvShortForSignal('production')).toBe('prod');
  });
});

describe('defaultGcsRawBucketName', () => {
  it('builds <project>-signal-<env>-raw', () => {
    expect(defaultGcsRawBucketName('my-gcp-project', 'development')).toBe(
      'my-gcp-project-signal-dev-raw',
    );
    expect(defaultGcsRawBucketName('my-gcp-project', 'staging')).toBe(
      'my-gcp-project-signal-staging-raw',
    );
    expect(defaultGcsRawBucketName('my-gcp-project', 'production')).toBe(
      'my-gcp-project-signal-prod-raw',
    );
  });

  it('trims project id', () => {
    expect(defaultGcsRawBucketName('  proj  ', 'development')).toBe('proj-signal-dev-raw');
  });

  it('throws on empty project id', () => {
    expect(() => defaultGcsRawBucketName('', 'development')).toThrow(/non-empty/);
    expect(() => defaultGcsRawBucketName('   ', 'development')).toThrow(/non-empty/);
  });
});
