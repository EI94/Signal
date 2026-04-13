import type { EntityRef } from '@signal/contracts';

const MAX_HEADLINE_CHARS = 220;

/**
 * Prefer the first sentence of shortSummary for a newspaper-style headline.
 * Falls back to title with redundant "Type — …" prefix removed when it duplicates the category chip.
 */
export function pickEmailHeadline(input: {
  readonly title: string;
  readonly signalType: string;
  readonly shortSummary?: string | null;
}): string {
  const sum = input.shortSummary?.trim();
  if (sum && sum.length >= 30) {
    return firstSentenceOrTrim(sum, MAX_HEADLINE_CHARS);
  }
  if (sum && sum.length >= 12) {
    return sum.length <= MAX_HEADLINE_CHARS ? sum : `${sum.slice(0, MAX_HEADLINE_CHARS - 1)}…`;
  }
  const stripped = stripRedundantTypePrefix(input.title, input.signalType);
  return stripped.trim() || input.title.trim();
}

function firstSentenceOrTrim(text: string, max: number): string {
  const t = text.trim();
  const dot = t.indexOf('. ');
  if (dot >= 20 && dot < max - 1) {
    return `${t.slice(0, dot + 1).trim()}`;
  }
  if (t.length <= max) return t;
  const cut = t.lastIndexOf(' ', max - 2);
  const end = cut > 40 ? cut : max - 1;
  return `${t.slice(0, end).trim()}…`;
}

const EM_DASH = '\u2014';
const EN_DASH = '\u2013';

/**
 * Titles are often "Earnings / reporting — Entity A, Entity B". The grey chip already shows the type;
 * return the part after the dash when the first part clearly repeats the category.
 */
export function stripRedundantTypePrefix(title: string, signalType: string): string {
  const t = title.trim();
  if (!t.includes(EM_DASH) && !t.includes(EN_DASH)) {
    return t;
  }
  const sep = t.includes(EM_DASH) ? EM_DASH : EN_DASH;
  const parts = t.split(sep);
  if (parts.length < 2) return t;
  const first = parts[0]?.trim() ?? '';
  const rest = parts.slice(1).join(sep).trim();
  if (!rest) return t;
  if (firstSegmentMatchesSignalType(first, signalType)) {
    return rest;
  }
  return t;
}

function firstSegmentMatchesSignalType(segment: string, signalType: string): boolean {
  const s = segment.toLowerCase();
  switch (signalType) {
    case 'earnings_reporting_update':
      return /earnings|reporting|results/i.test(s);
    case 'partnership_mou':
      return /partnership|mou|m\.o\.u|memo/i.test(s);
    case 'ma_divestment':
      return /m\s*&\s*a|merger|acquisition|divest|divestment|sale|buyout/i.test(s);
    case 'project_award':
      return /project\s*award|contract\s*award|epc|award/i.test(s);
    case 'technology_milestone':
      return /technology|milestone|tech\s/i.test(s);
    default:
      return false;
  }
}

/** "Acme · Saipem · Aramco" for the meta line under the headline. */
export function formatEntityContextLine(refs: readonly EntityRef[] | undefined): string | null {
  if (!refs?.length) return null;
  const names = refs
    .map((r) => r.displayName?.trim())
    .filter((n): n is string => Boolean(n && n.length > 0));
  if (names.length === 0) return null;
  const unique = [...new Set(names)];
  const shown = unique.slice(0, 6);
  return shown.join(' · ');
}

/**
 * Extra paragraph under the headline: remainder of shortSummary after the headline sentence,
 * or full shortSummary when the headline came from the structured title, not from summary.
 */
export function pickSecondaryBlurb(
  shortSummary: string | null | undefined,
  headline: string,
): string | null {
  const sum = shortSummary?.trim();
  if (!sum) return null;
  const h = headline.trim();
  if (sum === h) return null;
  if (sum.startsWith(h)) {
    const rest = sum
      .slice(h.length)
      .trim()
      .replace(/^[\s.]+/, '')
      .trim();
    if (rest.length >= 12) return rest;
    return null;
  }
  return sum;
}
