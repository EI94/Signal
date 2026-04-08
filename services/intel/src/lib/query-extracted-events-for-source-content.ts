import { BigQuery } from '@google-cloud/bigquery';
import type { ExtractedEventFamilyMvp, ExtractedEventRow } from '@signal/contracts';
import { ExtractedEventFamilyMvpSchema } from '@signal/contracts';

function asDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') return new Date(v);
  if (v !== null && v !== undefined && typeof v === 'object' && 'value' in v) {
    return new Date((v as { value: string }).value);
  }
  throw new Error('expected_date_field');
}

function parseLinkedEntities(raw: unknown): ExtractedEventRow['linked_entity_refs_json'] {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) return raw as ExtractedEventRow['linked_entity_refs_json'];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ExtractedEventRow['linked_entity_refs_json'];
    } catch {
      /* not JSON */
    }
  }
  return null;
}

/**
 * Loads analytical `extracted_events` rows that cite `sourceContentId` in evidence.
 */
export async function queryExtractedEventsForSourceContent(params: {
  projectId: string;
  datasetId: string;
  tableId: string;
  sourceContentId: string;
}): Promise<ExtractedEventRow[]> {
  const bq = new BigQuery({ projectId: params.projectId });
  const fq = `\`${params.projectId}.${params.datasetId}.${params.tableId}\``;
  const query = `
    SELECT
      extracted_event_id,
      event_family,
      event_time,
      event_time_precision,
      confidence,
      ambiguity_notes,
      evidence_source_content_ids,
      extracted_facts_json,
      linked_entity_refs_json,
      created_at
    FROM ${fq}
    WHERE @sc IN UNNEST(evidence_source_content_ids)
  `;
  const [job] = await bq.createQueryJob({
    query,
    params: { sc: params.sourceContentId },
  });
  const [rows] = await job.getQueryResults();

  const out: ExtractedEventRow[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const family = ExtractedEventFamilyMvpSchema.safeParse(r.event_family);
    if (!family.success) continue;

    const factsRaw = r.extracted_facts_json;
    let facts: Record<string, unknown> | null = null;
    if (typeof factsRaw === 'string') {
      try {
        const parsed = JSON.parse(factsRaw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          facts = parsed as Record<string, unknown>;
        }
      } catch {
        /* not JSON */
      }
    } else if (
      factsRaw !== null &&
      factsRaw !== undefined &&
      typeof factsRaw === 'object' &&
      !Array.isArray(factsRaw)
    ) {
      facts = factsRaw as Record<string, unknown>;
    }

    const evidence = (r.evidence_source_content_ids as string[]) ?? [];
    if (evidence.length < 1) continue;

    out.push({
      extracted_event_id: String(r.extracted_event_id),
      event_family: family.data as ExtractedEventFamilyMvp,
      event_time: asDate(r.event_time),
      event_time_precision:
        r.event_time_precision === null || r.event_time_precision === undefined
          ? null
          : String(r.event_time_precision),
      confidence:
        r.confidence === null || r.confidence === undefined
          ? null
          : (() => {
              const n = Number(r.confidence);
              return Number.isFinite(n) ? Math.round(n) : null;
            })(),
      ambiguity_notes:
        r.ambiguity_notes === null || r.ambiguity_notes === undefined
          ? null
          : String(r.ambiguity_notes),
      evidence_source_content_ids: evidence,
      extracted_facts_json: facts,
      linked_entity_refs_json: parseLinkedEntities(r.linked_entity_refs_json),
      created_at: asDate(r.created_at),
    });
  }

  return out;
}
