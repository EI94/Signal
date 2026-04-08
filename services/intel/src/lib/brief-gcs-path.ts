/**
 * Deterministic object key for morning brief markdown in the raw bucket.
 * `workspace_id=` segment is path-safe (no raw slashes in workspace ids expected for MVP).
 */
export function buildBriefMarkdownObjectKey(params: {
  workspaceId: string;
  periodDateStr: string;
  briefId: string;
}): string {
  return `briefs/workspace_id=${params.workspaceId}/date=${params.periodDateStr}/${params.briefId}.md`;
}
