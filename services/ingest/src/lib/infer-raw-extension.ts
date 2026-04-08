import type { RawArchiveExtension, SourceType } from '@signal/contracts';

/**
 * Choose a boring file extension for the raw object key from registry type + response Content-Type.
 */
export function inferRawArchiveExtension(
  registrySourceType: SourceType,
  contentType: string | null,
): RawArchiveExtension {
  const ct = (contentType ?? '').toLowerCase();
  if (registrySourceType === 'pdf_endpoint' || ct.includes('pdf')) {
    return 'pdf';
  }
  if (ct.includes('json') || registrySourceType === 'json_api') {
    return 'json';
  }
  if (ct.includes('xml') || ct.includes('rss') || ct.includes('atom')) {
    return 'xml';
  }
  if (
    ct.includes('html') ||
    registrySourceType === 'web_page' ||
    registrySourceType === 'regulatory_feed'
  ) {
    return 'html';
  }
  if (registrySourceType === 'rss_feed') {
    return 'xml';
  }
  return 'bin';
}
