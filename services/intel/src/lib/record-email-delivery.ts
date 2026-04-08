import type { EmailDeliveryDocument } from '@signal/contracts';
import type admin from 'firebase-admin';

export async function writeEmailDeliveryDocument(params: {
  db: admin.firestore.Firestore;
  workspaceId: string;
  deliveryId: string;
  doc: EmailDeliveryDocument;
}): Promise<void> {
  await params.db
    .collection('workspaces')
    .doc(params.workspaceId)
    .collection('emailDeliveries')
    .doc(params.deliveryId)
    .set(params.doc);
}
