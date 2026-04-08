import type { EntityRef } from '@signal/contracts/firestore-operational';
import {
  type CheckFrequencyBucket,
  type SourceCategory,
  type SourcePriorityTier,
  type SourceRegistryDocument,
  SourceRegistryDocumentSchema,
} from '@signal/contracts/source-registry';
import { sourceIdFromCanonicalUrl } from './deterministic-ids';
import type { ResolveEntityTokenResult } from './resolve-entity';

const MAIRE_CATEGORY_TO_SOURCE: Record<string, SourceCategory> = {
  group_corporate: 'corporate_reporting',
  group_governance: 'corporate_reporting',
  group_investor_relations: 'corporate_reporting',
  group_solutions: 'technology',
  group_newsroom: 'corporate_reporting',
  subsidiary_newsroom: 'corporate_reporting',
  technology_portfolio: 'technology',
  key_reference_project: 'project_pipeline',
  client_newsroom: 'client',
  client_corporate: 'client',
  competitor_newsroom: 'competitor',
  market_regulatory: 'policy_regulatory',
  market_association: 'general_market',
};

function mapPriorityTier(raw: string | undefined): SourcePriorityTier {
  const s = raw?.trim().toLowerCase() ?? '';
  if (s === 'p0_critical') return 'p0_critical';
  if (s === 'p1_high') return 'p1_high';
  if (s === 'p2_low' || s === 'p2_standard') return 'p2_standard';
  if (s === 'p3_low') return 'p3_low';
  return 'p2_standard';
}

function mapCheckFrequency(raw: string | undefined): {
  bucket: CheckFrequencyBucket;
  note?: string;
} {
  const s = raw?.trim().toLowerCase() ?? '';
  if (s === 'hourly') return { bucket: 'hourly' };
  if (s === 'every_6h') return { bucket: 'every_6h' };
  if (s === 'daily') return { bucket: 'daily' };
  if (s === 'weekly') return { bucket: 'weekly' };
  if (s === 'monthly') {
    return {
      bucket: 'weekly',
      note: 'CSV checkFrequencyBucket was monthly; mapped to weekly (schema).',
    };
  }
  return { bucket: 'weekly', note: `Unknown frequency "${raw ?? ''}"; defaulted to weekly.` };
}

function sourceNameFromUrl(canonicalUrl: string): string {
  try {
    const u = new URL(canonicalUrl);
    const path = u.pathname === '/' ? '' : u.pathname;
    const s = `${u.hostname}${path}`.replace(/\s+/g, ' ');
    return s.slice(0, 120) || canonicalUrl.slice(0, 120);
  } catch {
    return canonicalUrl.slice(0, 120);
  }
}

function truncateNotes(s: string | undefined, max = 500): string | undefined {
  if (s === undefined || s.trim() === '') return undefined;
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export type MapSourceContext = {
  readonly createdBy: string;
  readonly now: Date;
  readonly resolveEntityToken: (token: string) => ResolveEntityTokenResult;
};

export type MapSourceResult =
  | { ok: true; doc: SourceRegistryDocument }
  | { ok: false; error: string };

/**
 * Map one Sources.csv row into `SourceRegistryDocument` (deterministic `sourceId` from URL).
 */
export function mapSourceRowToRegistry(
  row: Record<string, string>,
  ctx: MapSourceContext,
): MapSourceResult {
  const canonicalUrl = row.canonicalUrl?.trim();
  if (!canonicalUrl) {
    return { ok: false, error: 'missing canonicalUrl' };
  }

  const rawCat = row.category?.trim() ?? '';
  const category = MAIRE_CATEGORY_TO_SOURCE[rawCat];
  if (!category) {
    return { ok: false, error: `unknown or unsupported category "${rawCat}"` };
  }

  const sourceType = row.sourceType?.trim();
  if (sourceType !== 'web_page' && sourceType !== 'pdf_endpoint') {
    return {
      ok: false,
      error: `unsupported sourceType "${sourceType}" (expected web_page|pdf_endpoint)`,
    };
  }

  const freq = mapCheckFrequency(row.checkFrequencyBucket);
  const fetchMethodHint = sourceType === 'pdf_endpoint' ? 'pdf' : 'html';
  const parserStrategyKey = sourceType === 'pdf_endpoint' ? 'pdf_generic' : 'html_generic';
  const expectedContentKind = sourceType === 'pdf_endpoint' ? 'pdf_binary' : 'web_html';

  const tokens = (row.linkedEntityRefs ?? '')
    .split(';')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const linkedEntityRefs: EntityRef[] = [];
  const unresolved: string[] = [];
  for (const tok of tokens) {
    const res = ctx.resolveEntityToken(tok);
    if (res.ok) {
      linkedEntityRefs.push(res.ref);
      continue;
    }
    if (res.kind === 'ambiguous') {
      return { ok: false, error: `linkedEntityRefs: ${res.detail}` };
    }
    unresolved.push(tok);
  }

  let notes = truncateNotes(row.notes);
  const extraBits: string[] = [];
  if (freq.note) extraBits.push(freq.note);
  if (unresolved.length > 0) {
    extraBits.push(`Unresolved entity tokens (omitted): ${unresolved.join('; ')}`);
  }
  if (extraBits.length > 0) {
    const merged = [notes, extraBits.join(' ')].filter(Boolean).join(' ');
    notes = truncateNotes(merged);
  }

  const sourceId = sourceIdFromCanonicalUrl(canonicalUrl);

  const candidate: SourceRegistryDocument = {
    sourceId,
    name: sourceNameFromUrl(canonicalUrl),
    canonicalUrl,
    sourceType,
    category,
    isActive: true,
    authorityScore: Math.min(
      100,
      Math.max(0, Number.parseInt(row.authorityScore ?? '50', 10) || 50),
    ),
    priorityTier: mapPriorityTier(row.priorityTier),
    fetchStrategy: {
      fetchMethodHint,
      checkFrequencyBucket: freq.bucket,
      etagSupport: 'unknown',
      authRequired: false,
    },
    parserStrategy: {
      parserStrategyKey,
      contentLanguageHint: 'en',
      expectedContentKind,
    },
    linkedEntityRefs,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    createdBy: ctx.createdBy,
    notes,
  };

  const parsed = SourceRegistryDocumentSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, doc: parsed.data };
}
