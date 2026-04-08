import type { IntelRuntimeConfig } from '@signal/config';
import type { ExtractedEventRow, ExtractSourceContentRequest } from '@signal/contracts';
import { deleteExtractedEventsForSourceContentId } from './delete-extracted-events-for-source-content';
import { downloadObjectBytes } from './download-object';
import { extractDeterministicEventsFromNormalizedContent } from './extract-events-from-normalized-content';
import { parseGcsUri } from './gcs-uri';
import { insertExtractedEventRows } from './insert-extracted-events';
import { updateSourceContentExtractionRow } from './update-source-content-extraction';

export type ExtractProcessDeps = {
  downloadBytes: (bucket: string, objectKey: string) => Promise<Buffer>;
  deleteExtractedForSourceContent: (args: {
    projectId: string;
    datasetId: string;
    tableId: string;
    sourceContentId: string;
  }) => Promise<void>;
  insertExtractedRows: (args: {
    projectId: string;
    datasetId: string;
    tableId: string;
    rows: ExtractedEventRow[];
  }) => Promise<void>;
  updateSourceContentRow: typeof updateSourceContentExtractionRow;
};

export type ExtractSourceContentResult =
  | { ok: true; skipped: true; reason: 'extraction_disabled' }
  | {
      ok: true;
      skipped: false;
      sourceContentId: string;
      extractedEventCount: number;
      extractionStatus: 'extracted_ready' | 'no_events_detected';
    };

export async function processExtractSourceContent(
  body: ExtractSourceContentRequest,
  config: IntelRuntimeConfig,
  deps: ExtractProcessDeps,
): Promise<ExtractSourceContentResult> {
  if (!config.eventExtractionEnabled) {
    return { ok: true, skipped: true, reason: 'extraction_disabled' };
  }

  try {
    const loc = parseGcsUri(body.normalizedGcsUri);
    const buf = await deps.downloadBytes(loc.bucket, loc.objectKey);
    let text = buf.toString('utf8');
    if (text.length > config.maxNormalizedTextCharsForExtraction) {
      text = text.slice(0, config.maxNormalizedTextCharsForExtraction);
    }

    const observedAt = new Date(body.observedAt);
    const publishedAt = body.publishedAt ? new Date(body.publishedAt) : null;

    const rows = extractDeterministicEventsFromNormalizedContent({
      sourceContentId: body.sourceContentId,
      normalizedText: text,
      observedAt,
      publishedAt,
      sourceCategory: body.sourceCategory,
      linkedEntityRefs: body.linkedEntityRefs,
    });

    await deps.deleteExtractedForSourceContent({
      projectId: config.firebaseProjectId,
      datasetId: config.bigQueryDatasetId,
      tableId: config.bigQueryExtractedEventsTableId,
      sourceContentId: body.sourceContentId,
    });

    await deps.insertExtractedRows({
      projectId: config.firebaseProjectId,
      datasetId: config.bigQueryDatasetId,
      tableId: config.bigQueryExtractedEventsTableId,
      rows,
    });

    const count = rows.length;
    const extractionStatus = count > 0 ? 'extracted_ready' : 'no_events_detected';

    await deps.updateSourceContentRow({
      projectId: config.firebaseProjectId,
      datasetId: config.bigQueryDatasetId,
      tableId: config.bigQuerySourceContentsTableId,
      sourceContentId: body.sourceContentId,
      extractionStatus,
      normalizedGcsUri: body.normalizedGcsUri,
      extractionErrorCode: null,
      extractedEventCount: count,
    });

    return {
      ok: true,
      skipped: false,
      sourceContentId: body.sourceContentId,
      extractedEventCount: count,
      extractionStatus,
    };
  } catch (err) {
    const code = err instanceof Error ? err.message.slice(0, 240) : 'unknown_error';
    try {
      await deps.updateSourceContentRow({
        projectId: config.firebaseProjectId,
        datasetId: config.bigQueryDatasetId,
        tableId: config.bigQuerySourceContentsTableId,
        sourceContentId: body.sourceContentId,
        extractionStatus: 'extraction_failed',
        normalizedGcsUri: body.normalizedGcsUri,
        extractionErrorCode: code,
        extractedEventCount: null,
      });
    } catch {
      /* best-effort status patch */
    }
    throw err;
  }
}

export function createDefaultExtractDeps(config: IntelRuntimeConfig): ExtractProcessDeps {
  return {
    downloadBytes: (bucket, objectKey) =>
      downloadObjectBytes({ projectId: config.firebaseProjectId, bucketName: bucket, objectKey }),
    deleteExtractedForSourceContent: (args) => deleteExtractedEventsForSourceContentId(args),
    insertExtractedRows: (args) => insertExtractedEventRows(args),
    updateSourceContentRow: (args) => updateSourceContentExtractionRow(args),
  };
}
