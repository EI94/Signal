/**
 * @signal/config — shared runtime configuration helpers.
 *
 * Server-side loaders (`loadApiRuntimeConfig`, etc.) must only run in Node services.
 * Do not import them from browser bundles. For client-safe values later, use only
 * `NEXT_PUBLIC_*` via Next.js and keep a separate entry if needed.
 *
 * Secret names for GCP (Terraform): see README.md in this package.
 */

export type { TerraformEnvShort } from './ingest-gcs-defaults';
export { defaultGcsRawBucketName, terraformEnvShortForSignal } from './ingest-gcs-defaults';
export { loadApiRuntimeConfig } from './load-api';
export { loadIngestRuntimeConfig } from './load-ingest';
export { loadIntelRuntimeConfig } from './load-intel';
export { parseRuntimeEnvName, parseServerRuntimeEnv } from './server-runtime';
export type {
  ApiRuntimeConfig,
  IngestRuntimeConfig,
  IntelRuntimeConfig,
  LogLevel,
  RuntimeEnvName,
  ServerRuntimeConfig,
} from './types';
