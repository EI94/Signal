import type { BriefDocument } from '@signal/contracts';
import type admin from 'firebase-admin';

export async function writeBriefDocumentToFirestore(params: {
  db: admin.firestore.Firestore;
  workspaceId: string;
  briefId: string;
  doc: BriefDocument;
}): Promise<void> {
  await params.db
    .collection('workspaces')
    .doc(params.workspaceId)
    .collection('briefs')
    .doc(params.briefId)
    .set(params.doc);
}
