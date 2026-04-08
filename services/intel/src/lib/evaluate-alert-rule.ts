import type { AlertCondition, LatestSignalDocument } from '@signal/contracts';
import { AlertConditionSchema } from '@signal/contracts';

export type RuleMatchResult = {
  matched: boolean;
  reasonCode: string | null;
};

/**
 * Parse the untyped `conditions` Record from an AlertRuleDocument into typed AlertCondition.
 * Returns null if the conditions are not valid (rule should be skipped, not crash).
 */
export function parseRuleConditions(raw: Record<string, unknown>): AlertCondition | null {
  const result = AlertConditionSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Evaluate a single alert rule's conditions against a signal.
 * All conditions are AND-combined. Missing/undefined fields always pass.
 *
 * Pure, deterministic, no side effects.
 */
export function evaluateRuleAgainstSignal(
  conditions: AlertCondition,
  signal: LatestSignalDocument,
): RuleMatchResult {
  if (conditions.signalType !== undefined && signal.signalType !== conditions.signalType) {
    return { matched: false, reasonCode: 'signalType_mismatch' };
  }

  if (conditions.minScore !== undefined && Math.round(signal.score) < conditions.minScore) {
    return { matched: false, reasonCode: 'score_below_threshold' };
  }

  if (conditions.novelty !== undefined && signal.novelty !== conditions.novelty) {
    return { matched: false, reasonCode: 'novelty_mismatch' };
  }

  if (conditions.entityRef !== undefined) {
    const found = signal.entityRefs.some(
      (e) =>
        e.entityType === conditions.entityRef?.entityType &&
        e.entityId === conditions.entityRef?.entityId,
    );
    if (!found) {
      return { matched: false, reasonCode: 'entityRef_not_linked' };
    }
  }

  if (conditions.entityRefs !== undefined && conditions.entityRefs.length > 0) {
    const found = conditions.entityRefs.some((cr) =>
      signal.entityRefs.some(
        (sr) => sr.entityType === cr.entityType && sr.entityId === cr.entityId,
      ),
    );
    if (!found) {
      return { matched: false, reasonCode: 'entityRefs_not_linked' };
    }
  }

  if (conditions.countryEntityIds !== undefined && conditions.countryEntityIds.length > 0) {
    const geoRefs = signal.entityRefs.filter((r) => r.entityType === 'geography');
    const found = conditions.countryEntityIds.some((id) => geoRefs.some((r) => r.entityId === id));
    if (!found) {
      return { matched: false, reasonCode: 'country_not_linked' };
    }
  }

  if (conditions.keyword !== undefined) {
    const kw = conditions.keyword.toLowerCase();
    const haystack = [signal.title, signal.shortSummary ?? ''].join(' ').toLowerCase();
    if (!haystack.includes(kw)) {
      return { matched: false, reasonCode: 'keyword_not_found' };
    }
  }

  return { matched: true, reasonCode: null };
}
