import { describe, expect, it } from 'vitest';
import { normalizeIntelContent } from './normalize-intel-content';

describe('normalizeIntelContent', () => {
  it('defers PDF by mime', () => {
    const r = normalizeIntelContent({
      contentRecordType: 'web_page',
      mimeType: 'application/pdf',
      rawBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    });
    expect(r.kind).toBe('pdf_deferred');
  });

  it('defers pdf_document record type', () => {
    const r = normalizeIntelContent({
      contentRecordType: 'pdf_document',
      mimeType: 'application/octet-stream',
      rawBytes: new Uint8Array([1]),
    });
    expect(r.kind).toBe('pdf_deferred');
  });

  it('normalizes HTML-ish text', () => {
    const r = normalizeIntelContent({
      contentRecordType: 'web_page',
      mimeType: 'text/html',
      rawBytes: new TextEncoder().encode('<html>\r\nx</html>'),
    });
    expect(r.kind).toBe('normalized');
    if (r.kind === 'normalized') expect(r.text).toContain('<html>');
  });

  it('pretty-prints JSON when json_api', () => {
    const r = normalizeIntelContent({
      contentRecordType: 'json_api',
      mimeType: 'application/json',
      rawBytes: new TextEncoder().encode('{"a":1}'),
    });
    expect(r.kind).toBe('normalized');
    if (r.kind === 'normalized') expect(r.text).toContain('\n  "a"');
  });

  it('skips unknown binary when not a text kind and mime is not text-like', () => {
    const r = normalizeIntelContent({
      contentRecordType: 'unknown_future_kind',
      mimeType: 'application/octet-stream',
      rawBytes: new Uint8Array([0, 1, 2, 3]),
    });
    expect(r.kind).toBe('skipped');
    if (r.kind === 'skipped') expect(r.code).toBe('non_text_binary');
  });
});
