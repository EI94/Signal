import {
  buildMatchSignature,
  deriveExtractedEventId,
  type EntityRef,
  type ExtractedEventFamilyMvp,
  type ExtractedEventRow,
} from '@signal/contracts';

export type ExtractionInput = {
  sourceContentId: string;
  normalizedText: string;
  observedAt: Date;
  publishedAt: Date | null;
  sourceCategory?: string;
  linkedEntityRefs: readonly EntityRef[];
};

type Rule = {
  family: ExtractedEventFamilyMvp;
  /** Lowercase substrings; first match wins for this family. */
  phrases: string[];
};

/** Boring keyword heuristics (v1). Documented in code; not semantic AI. */
const RULES: readonly Rule[] = [
  {
    family: 'project_award',
    phrases: [
      'contract awarded',
      'awarded the contract',
      'preferred bidder',
      'won the tender',
      'project award',
      'epc contract',
      'selected to build',
    ],
  },
  {
    family: 'partnership_mou',
    phrases: [
      'memorandum of understanding',
      'strategic partnership',
      'joint venture',
      'partnership agreement',
      'mou with',
      'signing ceremony',
    ],
  },
  {
    family: 'earnings_reporting_update',
    phrases: [
      'quarterly results',
      'full year results',
      'earnings release',
      'financial results',
      'ebitda',
      'guidance for',
      'investor presentation',
    ],
  },
  {
    family: 'ma_divestment',
    phrases: [
      'to acquire',
      'merger agreement',
      'divestment',
      'disposal of',
      'sale of subsidiary',
      'm&a',
      'acquisition of',
    ],
  },
  {
    family: 'technology_milestone',
    phrases: [
      'technology milestone',
      'commissioning of',
      'patent granted',
      'r&d',
      'innovation hub',
      'first power',
    ],
  },
];

function findSnippet(lower: string, phrase: string): string | null {
  const idx = lower.indexOf(phrase);
  if (idx < 0) return null;
  const start = Math.max(0, idx - 80);
  const end = Math.min(lower.length, idx + phrase.length + 120);
  return lower.slice(start, end);
}

function confidenceForMatch(
  hitCount: number,
  sourceCategory: string | undefined,
  family: ExtractedEventFamilyMvp,
): number {
  let c = 52 + Math.min(28, hitCount * 6);
  if (sourceCategory === 'project_pipeline' && family === 'project_award') c += 8;
  if (sourceCategory === 'corporate_reporting' && family === 'earnings_reporting_update') c += 8;
  return Math.min(92, c);
}

/**
 * Returns zero or one ExtractedEvent row per supported family (max 5 rows).
 */
export function extractDeterministicEventsFromNormalizedContent(
  input: ExtractionInput,
): ExtractedEventRow[] {
  const lower = input.normalizedText.toLowerCase();
  const createdAt = new Date();
  const eventTime = input.publishedAt ?? input.observedAt;
  const rows: ExtractedEventRow[] = [];
  let ordinal = 0;

  for (const rule of RULES) {
    const matchedTerms: string[] = [];
    let bestSnippet = '';
    for (const phrase of rule.phrases) {
      if (!lower.includes(phrase)) continue;
      matchedTerms.push(phrase);
      const found = findSnippet(lower, phrase);
      if (found && found.length > bestSnippet.length) bestSnippet = found;
    }
    if (matchedTerms.length === 0) continue;

    const ambiguityNotes =
      matchedTerms.length >= 3
        ? 'Multiple keyword hits; heuristic match only.'
        : matchedTerms.length === 1
          ? 'Single keyword match; verify context.'
          : null;

    const confidence = confidenceForMatch(matchedTerms.length, input.sourceCategory, rule.family);
    const matchSignature = buildMatchSignature({
      matchedTerms,
      evidenceSnippet: bestSnippet || (matchedTerms[0] ?? ''),
      ordinal,
    });
    const extracted_event_id = deriveExtractedEventId({
      sourceContentId: input.sourceContentId,
      eventFamily: rule.family,
      matchSignature,
    });

    const facts: Record<string, unknown> = {
      extractor: 'deterministic_keyword_v1',
      matchedTerms,
      sourceCategory: input.sourceCategory ?? null,
    };

    rows.push({
      extracted_event_id,
      event_family: rule.family,
      event_time: eventTime,
      event_time_precision: 'day',
      confidence,
      ambiguity_notes: ambiguityNotes,
      evidence_source_content_ids: [input.sourceContentId],
      extracted_facts_json: facts,
      linked_entity_refs_json:
        input.linkedEntityRefs.length > 0 ? [...input.linkedEntityRefs] : null,
      created_at: createdAt,
    });
    ordinal++;
  }

  return rows;
}
