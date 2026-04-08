export type NormalizeIntelOutcome =
  | { kind: 'normalized'; text: string }
  | { kind: 'pdf_deferred' }
  | { kind: 'skipped'; code: 'non_text_binary' }
  | { kind: 'failed'; code: string };

function isTextLikeMime(mime: string | null): boolean {
  const ct = (mime ?? '').toLowerCase();
  return (
    ct.startsWith('text/') ||
    ct.includes('json') ||
    ct.includes('xml') ||
    ct.includes('html') ||
    ct.includes('javascript') ||
    ct.includes('rss') ||
    ct.includes('atom') ||
    ct.includes('plain')
  );
}

/** Content record kinds we always attempt to treat as UTF-8 text (MVP). */
const TEXT_ATTEMPT_RECORD_TYPES = new Set([
  'web_page',
  'rss_entry',
  'json_api',
  'regulatory_filing',
]);

/**
 * Boring normalization: UTF-8, BOM strip, newlines; JSON pretty-print when applicable.
 * PDFs are deferred; no semantic HTML extraction.
 */
export function normalizeIntelContent(params: {
  contentRecordType: string;
  mimeType: string | null;
  rawBytes: Uint8Array;
}): NormalizeIntelOutcome {
  const { contentRecordType, mimeType, rawBytes } = params;
  const mimeLower = (mimeType ?? '').toLowerCase();

  if (contentRecordType === 'pdf_document' || mimeLower.includes('pdf')) {
    return { kind: 'pdf_deferred' };
  }

  const tryAsText = TEXT_ATTEMPT_RECORD_TYPES.has(contentRecordType) || isTextLikeMime(mimeType);

  if (!tryAsText) {
    return { kind: 'skipped', code: 'non_text_binary' };
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: false })
      .decode(rawBytes)
      .replace(/\uFEFF/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    let out = text;
    const looksJson =
      contentRecordType === 'json_api' || mimeLower.includes('json') || mimeLower.endsWith('+json');
    if (looksJson) {
      try {
        const parsed = JSON.parse(out) as unknown;
        out = JSON.stringify(parsed, null, 2);
      } catch {
        /* keep raw text */
      }
    }

    return { kind: 'normalized', text: out };
  } catch {
    return { kind: 'failed', code: 'utf8_decode_failed' };
  }
}
