import { describe, expect, it } from 'vitest';
import { inferRawArchiveExtension } from './infer-raw-extension';

describe('inferRawArchiveExtension', () => {
  it('prefers pdf for pdf endpoint', () => {
    expect(inferRawArchiveExtension('pdf_endpoint', 'application/pdf')).toBe('pdf');
  });

  it('uses xml for rss feeds', () => {
    expect(inferRawArchiveExtension('rss_feed', 'application/rss+xml')).toBe('xml');
  });

  it('maps json_api to json even with odd media types', () => {
    expect(inferRawArchiveExtension('json_api', 'application/x-odd')).toBe('json');
  });
});
