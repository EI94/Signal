import { describe, expect, it } from 'vitest';
import { registrySourceTypeToContentRecordType } from './map-content-record-type';

describe('registrySourceTypeToContentRecordType', () => {
  it('maps registry endpoint types to content record kinds', () => {
    expect(registrySourceTypeToContentRecordType('rss_feed')).toBe('rss_entry');
    expect(registrySourceTypeToContentRecordType('pdf_endpoint')).toBe('pdf_document');
    expect(registrySourceTypeToContentRecordType('web_page')).toBe('web_page');
    expect(registrySourceTypeToContentRecordType('json_api')).toBe('json_api');
    expect(registrySourceTypeToContentRecordType('regulatory_feed')).toBe('regulatory_filing');
  });
});
