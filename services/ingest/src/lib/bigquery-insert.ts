import { BigQuery } from '@google-cloud/bigquery';

export type SourceContentsRow = {
  source_content_id: string;
  source_id: string;
  /** Firestore `Source.sourceType` (registry / endpoint definition). */
  registry_source_type: string;
  /** Ontology content record kind (e.g. `rss_entry`); see `registrySourceTypeToContentRecordType`. */
  source_type: string;
  /** HTTP response `Content-Type` (MIME); not a registry or ontology enum. */
  mime_type: string | null;
  source_url: string;
  content_hash: string;
  published_at: Date | null;
  observed_at: Date;
  archived_gcs_uri: string;
  extraction_status: string;
  language: string | null;
  workspace_id: string | null;
  created_at: Date;
};

export async function insertSourceContentRow(params: {
  projectId: string;
  datasetId: string;
  tableId: string;
  row: SourceContentsRow;
}): Promise<void> {
  const bq = new BigQuery({ projectId: params.projectId });
  const table = bq.dataset(params.datasetId).table(params.tableId);
  await table.insert([params.row]);
}
