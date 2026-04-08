import { BigQuery } from '@google-cloud/bigquery';
import type { SourceContentExtractionStatus } from '@signal/contracts';

/** Updates only promotion-related fields without touching normalized_gcs_uri / counts. */
export async function updateSourceContentPromotionStatus(params: {
  projectId: string;
  datasetId: string;
  tableId: string;
  sourceContentId: string;
  extractionStatus: SourceContentExtractionStatus;
  extractionErrorCode: string | null;
}): Promise<void> {
  const bq = new BigQuery({ projectId: params.projectId });
  const table = `\`${params.projectId}.${params.datasetId}.${params.tableId}\``;
  const query = `
    UPDATE ${table}
    SET extraction_status = @extraction_status,
        extraction_error_code = @extraction_error_code
    WHERE source_content_id = @source_content_id
  `;
  try {
    await bq.query({
      query,
      params: {
        extraction_status: params.extractionStatus,
        extraction_error_code: params.extractionErrorCode,
        source_content_id: params.sourceContentId,
      },
      types: {
        extraction_error_code: 'STRING',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('streaming buffer')) {
      console.warn(
        `[updateSourceContentPromotionStatus] streaming buffer DML skip for ${params.sourceContentId}`,
      );
      return;
    }
    throw err;
  }
}
