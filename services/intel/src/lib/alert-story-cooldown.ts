import { createHash } from 'node:crypto';
import type { LatestSignalDocument } from '@signal/contracts';
import { computeSignalStoryKey } from '@signal/contracts';
import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';

/** `workspaces/{workspaceId}/alertRecipientStoryCooldowns/{docId}` */
export function alertRecipientStoryCooldownRef(
  db: Firestore,
  workspaceId: string,
  recipientKey: string,
  storyKey: string,
) {
  const docId = cooldownDocumentId(recipientKey, storyKey);
  return db
    .collection('workspaces')
    .doc(workspaceId)
    .collection('alertRecipientStoryCooldowns')
    .doc(docId);
}

export function cooldownDocumentId(recipientKey: string, storyKey: string): string {
  return createHash('sha256')
    .update(`${recipientKey}|${storyKey}`, 'utf8')
    .digest('hex')
    .slice(0, 40);
}

export function normalizeRecipientEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Prefer mailbox identity; fall back to Firebase uid so in-app-only users still dedupe. */
export function recipientCooldownRoutingKey(email: string | undefined, uid: string): string {
  const e = email?.trim();
  if (e?.includes('@')) return normalizeRecipientEmail(e);
  return `uid:${uid}`;
}

export function resolveStoryKey(signal: LatestSignalDocument): string {
  return signal.storyKey ?? computeSignalStoryKey(signal);
}

/**
 * Returns true if this recipient was already notified about this story within the cooldown window.
 */
export async function isStoryWithinRecipientCooldown(params: {
  db: Firestore;
  workspaceId: string;
  recipientKey: string;
  storyKey: string;
  cooldownDays: number;
  now: Date;
}): Promise<boolean> {
  const { db, workspaceId, recipientKey, storyKey, cooldownDays, now } = params;
  if (cooldownDays <= 0) return false;

  const snap = await alertRecipientStoryCooldownRef(db, workspaceId, recipientKey, storyKey).get();
  if (!snap.exists) return false;

  const lastRaw = snap.data()?.lastNotifiedAt as Timestamp | Date | undefined;
  const last =
    lastRaw instanceof Timestamp ? lastRaw.toDate() : lastRaw instanceof Date ? lastRaw : null;
  if (!last) return false;

  const windowMs = cooldownDays * 24 * 60 * 60 * 1000;
  return now.getTime() - last.getTime() < windowMs;
}

export async function recordRecipientStoryCooldown(params: {
  db: Firestore;
  workspaceId: string;
  recipientKey: string;
  storyKey: string;
  signalId: string;
  now: Date;
}): Promise<void> {
  const { db, workspaceId, recipientKey, storyKey, signalId, now } = params;
  const ref = alertRecipientStoryCooldownRef(db, workspaceId, recipientKey, storyKey);
  await ref.set(
    {
      lastNotifiedAt: Timestamp.fromDate(now),
      lastSignalId: signalId,
      storyKey,
      recipientKey,
      updatedAt: Timestamp.fromDate(now),
    },
    { merge: true },
  );
}
