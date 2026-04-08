import type { SourceType } from '@signal/contracts';

/**
 * Maps registry `sourceType` (endpoint definition) → persisted **content record type**
 * (ontology / SourceContent kind) stored in BigQuery `source_contents.source_type`.
 *
 * Distinct from `registry_source_type` (same enum as Firestore `Source.sourceType`).
 */
export function registrySourceTypeToContentRecordType(registrySourceType: SourceType): string {
  const m: Record<SourceType, string> = {
    web_page: 'web_page',
    rss_feed: 'rss_entry',
    pdf_endpoint: 'pdf_document',
    json_api: 'json_api',
    regulatory_feed: 'regulatory_filing',
  };
  return m[registrySourceType];
}
