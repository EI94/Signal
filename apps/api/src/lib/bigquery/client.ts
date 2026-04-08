import { BigQuery } from '@google-cloud/bigquery';
import type { ApiRuntimeConfig } from '@signal/config';

/**
 * BigQuery is only constructed when a dataset id is configured (entity timeline and future analytical reads).
 */
export function createBigQueryClientWhenConfigured(config: ApiRuntimeConfig): BigQuery | null {
  if (!config.bigQueryDatasetId) {
    return null;
  }
  return new BigQuery({ projectId: config.firebaseProjectId });
}
