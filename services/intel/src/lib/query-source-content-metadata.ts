import { BigQuery } from '@google-cloud/bigquery';

export type SourceContentMetadata = {
  sourceContentId: string;
  sourceId: string;
  sourceUrl: string;
  publishedAt: Date | null;
  normalizedGcsUri: string | null;
};

export async function querySourceContentMetadata(params: {
  projectId: string;
  datasetId: string;
  tableId: string;
  sourceContentId: string;
}): Promise<SourceContentMetadata | null> {
  const bq = new BigQuery({ projectId: params.projectId });
  const fq = `\`${params.projectId}.${params.datasetId}.${params.tableId}\``;
  const query = `
    SELECT source_content_id, source_id, source_url, published_at, normalized_gcs_uri
    FROM ${fq}
    WHERE source_content_id = @scId
    LIMIT 1
  `;
  const [job] = await bq.createQueryJob({
    query,
    params: { scId: params.sourceContentId },
  });
  const [rows] = await job.getQueryResults();
  if (!rows || rows.length === 0) return null;

  const r = rows[0] as Record<string, unknown>;
  let pubAt: Date | null = null;
  if (r.published_at) {
    const d = r.published_at instanceof Date ? r.published_at : new Date(String(r.published_at));
    if (!Number.isNaN(d.getTime())) pubAt = d;
  }

  return {
    sourceContentId: String(r.source_content_id),
    sourceId: String(r.source_id),
    sourceUrl: String(r.source_url ?? ''),
    publishedAt: pubAt,
    normalizedGcsUri: typeof r.normalized_gcs_uri === 'string' ? String(r.normalized_gcs_uri) : null,
  };
}
