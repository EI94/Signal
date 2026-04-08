import type { RuntimeEnvName } from './types';

/** Terraform `<env>` segment for GCS raw bucket and related defaults. */
export type TerraformEnvShort = 'dev' | 'staging' | 'prod';

/**
 * Maps runtime environment to Terraform's short env label used in resource names.
 * Aligns with `infra/terraform/README.md` (GCS: `<project_id>-signal-<env>-raw`).
 */
export function terraformEnvShortForSignal(environment: RuntimeEnvName): TerraformEnvShort {
  switch (environment) {
    case 'development':
      return 'dev';
    case 'staging':
      return 'staging';
    case 'production':
      return 'prod';
  }
}

/**
 * Default raw-archive bucket when `SIGNAL_GCS_RAW_BUCKET` is unset.
 * Exact convention: `<project_id>-signal-<env>-raw` with `env` ∈ { dev, staging, prod }.
 */
export function defaultGcsRawBucketName(projectId: string, environment: RuntimeEnvName): string {
  const id = projectId.trim();
  if (id.length === 0) {
    throw new Error('defaultGcsRawBucketName: projectId must be non-empty');
  }
  const env = terraformEnvShortForSignal(environment);
  return `${id}-signal-${env}-raw`;
}
