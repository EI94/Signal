import { BigQuery } from '@google-cloud/bigquery';
import type { SourceContentExtractionStatus } from '@signal/contracts';

/**
 * Best-effort UPDATE on BigQuery `source_contents`.
 * Rows in the streaming buffer (up to ~90 min after insert) reject DML;
 * this is non-fatal — the status is tracking metadata, not pipeline-critical.
 */
export async function updateSourceContentExtractionRow(params: {
  projectId: string;
  datasetId: string;
  tableId: string;
  sourceContentId: string;
  extractionStatus: SourceContentExtractionStatus;
  normalizedGcsUri: string | null;
  extractionErrorCode: string | null;
  extractedEventCount: number | null;
}): Promise<void> {
  const bq = new BigQuery({ projectId: params.projectId });
  const table = `\`${params.projectId}.${params.datasetId}.${params.tableId}\``;
  const query = `
    UPDATE ${table}
    SET extraction_status = @extraction_status,
        normalized_gcs_uri = @normalized_gcs_uri,
        extraction_error_code = @extraction_error_code,
        extracted_event_count = @extracted_event_count
    WHERE source_content_id = @source_content_id
  `;
  try {
    await bq.query({
      query,
      params: {
        extraction_status: params.extractionStatus,
        normalized_gcs_uri: params.normalizedGcsUri,
        extraction_error_code: params.extractionErrorCode,
        extracted_event_count: params.extractedEventCount,
        source_content_id: params.sourceContentId,
      },
      types: {
        normalized_gcs_uri: 'STRING',
        extraction_error_code: 'STRING',
        extracted_event_count: 'INT64',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('streaming buffer')) {
      console.warn(
        `[updateSourceContentExtractionRow] streaming buffer DML skip for ${params.sourceContentId}: ${msg}`,
      );
      return;
    }
    throw err;
  }
}
