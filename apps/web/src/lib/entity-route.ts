/** Build the client-side path for an entity detail page. */
export function entityPath(entityType: string, entityId: string): string {
  return `/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
}

const ENTITY_TYPE_LABEL: Record<string, string> = {
  organization: 'Organization',
  competitor: 'Competitor',
  client: 'Client',
  technology: 'Technology',
  geography: 'Geography',
  org: 'Organization',
};

export function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABEL[entityType] ?? entityType;
}
