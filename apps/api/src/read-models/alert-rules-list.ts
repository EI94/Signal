import type { AlertRulesListV1Response } from '@signal/contracts';
import { getFirestoreDb } from '../lib/firebase-admin';
import { parseAlertRuleDocument } from '../lib/firestore/parse-documents';
import { workspaceAlertRulesCollection } from '../lib/firestore/workspace-collections';

const FETCH_MAX = 200;

export async function buildAlertRulesListReadModel(
  workspaceId: string,
): Promise<AlertRulesListV1Response> {
  const db = getFirestoreDb();
  const col = workspaceAlertRulesCollection(db, workspaceId);
  const snap = await col.orderBy('updatedAt', 'desc').limit(FETCH_MAX).get();

  const items: AlertRulesListV1Response['items'] = [];
  for (const doc of snap.docs) {
    const parsed = parseAlertRuleDocument(doc.data());
    if (!parsed.success) continue;
    const d = parsed.data;
    items.push({
      ruleId: doc.id,
      name: d.name,
      isActive: d.isActive,
      updatedAt: d.updatedAt.toISOString(),
    });
  }

  return { workspaceId, items };
}
