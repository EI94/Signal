import type { LatestSignalDocument, SignalSummaryV1 } from '@signal/contracts';
import { ExtractedEventFamilyMvpSchema } from '@signal/contracts';
import type { GeographyEntityIndex } from './geography-index';

type CountryAttributionMode =
  | 'explicit_geography'
  | 'source_linked_geography'
  | 'text_inferred_geography'
  | 'hq_fallback';

type AttributionResult = {
  countryCodes: string[];
  primaryCountryCode: string | null;
  mode: CountryAttributionMode | null;
};

function clampCompositeScore(score: number): number {
  const r = Math.round(Number(score));
  if (Number.isNaN(r)) return 0;
  return Math.min(100, Math.max(0, r));
}

const SUPPRESSED_SUMMARIES = new Set([
  'single keyword match; verify context.',
  'multiple keyword hits; heuristic match only.',
]);

function cleanSummary(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (SUPPRESSED_SUMMARIES.has(raw.toLowerCase().trim())) return null;
  return raw;
}

/**
 * Country attribution with explicit precedence hierarchy:
 * 1. Explicit geography entity extracted from content (entityRefs with entityType=geography)
 * 2. Source-linked geography (from source registry, stored in provenance)
 * 3. Text-inferred geography (deterministic substring matching on title)
 * 4. Organization HQ fallback (weakest)
 */
function deriveCountryCodes(
  doc: LatestSignalDocument,
  geoIndex: GeographyEntityIndex | null,
): AttributionResult {
  if (!geoIndex) return { countryCodes: [], primaryCountryCode: null, mode: null };

  // Level 1: explicit geography entity refs
  const explicitCodes = new Set<string>();
  for (const ref of doc.entityRefs) {
    if (ref.entityType === 'geography') {
      const iso2 = geoIndex.entityIdToIso2.get(`geography:${ref.entityId}`);
      if (iso2) explicitCodes.add(iso2);
    }
  }
  if (explicitCodes.size > 0) {
    const arr = [...explicitCodes];
    return { countryCodes: arr, primaryCountryCode: arr[0] ?? null, mode: 'explicit_geography' };
  }

  // Level 2: source-linked geography (from source registry linked entity refs)
  const sourceCodes = new Set<string>();
  if (doc.provenance?.sourceLinkedGeoCodes) {
    for (const code of doc.provenance.sourceLinkedGeoCodes) {
      sourceCodes.add(code);
    }
  }
  if (sourceCodes.size > 0) {
    const arr = [...sourceCodes];
    return {
      countryCodes: arr,
      primaryCountryCode: arr[0] ?? null,
      mode: 'source_linked_geography',
    };
  }

  // Level 3: text-inferred geography from title (using data-driven patterns from seeded entities)
  const textCodes = geoIndex.inferFromText(doc.title);
  if (textCodes.length > 0) {
    return {
      countryCodes: textCodes,
      primaryCountryCode: textCodes[0] ?? null,
      mode: 'text_inferred_geography',
    };
  }

  // Level 4: organization HQ fallback (try entityId first, then slugified displayName)
  const hqCodes = new Set<string>();
  for (const ref of doc.entityRefs) {
    if (ref.entityType === 'organization') {
      let hq = geoIndex.orgHqCountry.get(ref.entityId);
      if (!hq && ref.displayName) {
        const slug = ref.displayName
          .toLowerCase()
          .replace(/&/g, '')
          .replace(/[\s/]+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
        hq = geoIndex.orgHqCountry.get(slug);
      }
      if (hq) hqCodes.add(hq);
    }
  }
  if (hqCodes.size > 0) {
    const arr = [...hqCodes];
    return { countryCodes: arr, primaryCountryCode: arr[0] ?? null, mode: 'hq_fallback' };
  }

  return { countryCodes: [], primaryCountryCode: null, mode: null };
}

export function mapLatestToSignalSummaryV1(
  doc: LatestSignalDocument,
  geoIndex?: GeographyEntityIndex | null,
): SignalSummaryV1 | null {
  const st = ExtractedEventFamilyMvpSchema.safeParse(doc.signalType);
  if (!st.success) return null;

  const { countryCodes, primaryCountryCode, mode } = deriveCountryCodes(doc, geoIndex ?? null);

  return {
    signalId: doc.signalId,
    signalType: st.data,
    title: doc.title,
    shortSummary: cleanSummary(doc.shortSummary),
    status: doc.status,
    novelty: doc.novelty ?? null,
    ...(doc.storyKey ? { storyKey: doc.storyKey } : {}),
    ...(doc.marketIndexTagIds && doc.marketIndexTagIds.length > 0
      ? { marketIndexTagIds: doc.marketIndexTagIds }
      : {}),
    compositeScore: clampCompositeScore(doc.score),
    occurredAt: doc.occurredAt.toISOString(),
    detectedAt: doc.detectedAt.toISOString(),
    primaryEntityRefs: doc.entityRefs.slice(0, 16),
    sourceLabel: doc.provenance?.sourceLabel ?? null,
    sourceUrl: doc.provenance?.sourceUrl ?? null,
    sourcePublishedAt:
      doc.provenance?.sourcePublishedAt?.toISOString?.() ?? doc.occurredAt.toISOString(),
    sourceTimeSemantic: doc.provenance?.sourcePublishedAt ? 'published' : 'observed',
    countryCodes: countryCodes.length > 0 ? countryCodes : undefined,
    primaryCountryCode: primaryCountryCode ?? undefined,
    countryAttributionMode: mode ?? undefined,
  };
}
