import { z } from 'zod';

/**
 * GET `/v1/alerts/rules` — list rule summaries (no full condition authoring).
 * Aligns loosely with Firestore `AlertRuleDocument` without exposing arbitrary JSON blobs as primary fields.
 */
export const AlertRuleSummaryV1Schema = z.object({
  ruleId: z.string().min(1),
  name: z.string().min(1),
  isActive: z.boolean(),
  updatedAt: z.string().datetime(),
});

export type AlertRuleSummaryV1 = z.infer<typeof AlertRuleSummaryV1Schema>;

export const AlertRulesListV1ResponseSchema = z.object({
  workspaceId: z.string().min(1),
  items: z.array(AlertRuleSummaryV1Schema).max(200),
});

export type AlertRulesListV1Response = z.infer<typeof AlertRulesListV1ResponseSchema>;
