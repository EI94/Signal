import { randomUUID } from 'node:crypto';
import type { IntelRuntimeConfig } from '@signal/config';
import type {
  BriefDocument,
  LatestSignalDocument,
  SendBriefEmailRequest,
  SendEmailDeliveryResponse,
} from '@signal/contracts';
import { BriefDocumentSchema, LatestSignalDocumentSchema } from '@signal/contracts';
import type admin from 'firebase-admin';
import { coerceFirestoreTimestamps } from './coerce-firestore-dates';
import { downloadObjectBytes } from './download-object';
import { buildEmailDeliveryRecipientAudit } from './email-delivery-recipient-audit';
import { getFirestoreDb } from './firebase-admin';
import { parseGcsUri } from './gcs-uri';
import { writeEmailDeliveryDocument } from './record-email-delivery';
import {
  buildBriefEmailHtml,
  buildBriefEmailPlainText,
  buildBriefEmailSubject,
} from './render-brief-email';
import { sendEmailViaResend } from './resend-adapter';
import { selectSignalsForBrief } from './select-brief-signals';

export type SendBriefEmailDeps = {
  loadBrief: (workspaceId: string, briefId: string) => Promise<BriefDocument | null>;
  downloadBriefBody: (summaryRef: string) => Promise<Buffer>;
  loadSignals: (workspaceId: string) => Promise<LatestSignalDocument[]>;
  sendResend: typeof sendEmailViaResend;
  writeDelivery: typeof writeEmailDeliveryDocument;
  getFirestore?: () => admin.firestore.Firestore;
  now: () => Date;
  randomId: () => string;
};

export function createDefaultSendBriefEmailDeps(config: IntelRuntimeConfig): SendBriefEmailDeps {
  return {
    getFirestore: () => getFirestoreDb(),
    loadBrief: async (workspaceId, briefId) => {
      const snap = await getFirestoreDb()
        .collection('workspaces')
        .doc(workspaceId)
        .collection('briefs')
        .doc(briefId)
        .get();
      if (!snap.exists) return null;
      const parsed = BriefDocumentSchema.safeParse(coerceFirestoreTimestamps(snap.data() ?? {}));
      return parsed.success ? parsed.data : null;
    },
    downloadBriefBody: async (summaryRef: string) => {
      const { bucket, objectKey } = parseGcsUri(summaryRef);
      return downloadObjectBytes({
        projectId: config.firebaseProjectId,
        bucketName: bucket,
        objectKey,
      });
    },
    loadSignals: async (workspaceId: string) => {
      const snap = await getFirestoreDb()
        .collection('workspaces')
        .doc(workspaceId)
        .collection('signalsLatest')
        .orderBy('detectedAt', 'desc')
        .limit(500)
        .get();
      const out: LatestSignalDocument[] = [];
      for (const doc of snap.docs) {
        const parsed = LatestSignalDocumentSchema.safeParse(coerceFirestoreTimestamps(doc.data()));
        if (parsed.success) out.push(parsed.data);
      }
      return out;
    },
    sendResend: sendEmailViaResend,
    writeDelivery: writeEmailDeliveryDocument,
    now: () => new Date(),
    randomId: randomUUID,
  };
}

function extractExecSummary(buf: Buffer): string | undefined {
  const text = buf.toString('utf8');
  const marker = '## Executive summary';
  const idx = text.indexOf(marker);
  if (idx === -1) return undefined;
  const afterMarker = text.slice(idx + marker.length);
  const nextSection = afterMarker.indexOf('\n## ');
  const block = nextSection === -1 ? afterMarker : afterMarker.slice(0, nextSection);
  const trimmed = block.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatDateLabel(start: Date): string {
  return start.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export async function sendBriefEmail(
  request: SendBriefEmailRequest & { workspaceId: string },
  config: IntelRuntimeConfig,
  deps: SendBriefEmailDeps,
): Promise<SendEmailDeliveryResponse> {
  const deliveryId = deps.randomId();
  const now = deps.now();

  if (!config.resendEnabled) {
    return { deliveryId, status: 'skipped', skippedReason: 'resend_disabled' };
  }

  if (request.to.length > config.emailMaxRecipientsPerRequest) {
    return { deliveryId, status: 'skipped', skippedReason: 'recipient_cap_exceeded' };
  }

  const db = deps.getFirestore?.() ?? getFirestoreDb();

  const brief = await deps.loadBrief(request.workspaceId, request.briefId);
  if (!brief) {
    const subject = 'Signal — brief not found';
    const audit = buildEmailDeliveryRecipientAudit(request.to);
    await deps.writeDelivery({
      db,
      workspaceId: request.workspaceId,
      deliveryId,
      doc: {
        kind: 'brief',
        status: 'failed',
        provider: 'resend',
        subject,
        recipientCount: audit.recipientCount,
        recipientDomains: audit.recipientDomains,
        recipientsMasked: audit.recipientsMasked,
        attemptedAt: now,
        errorMessage: 'brief_not_found',
        briefId: request.briefId,
        createdAt: now,
        updatedAt: now,
      },
    });
    return { deliveryId, status: 'failed', errorMessage: 'brief_not_found' };
  }

  const title = brief.title ?? `Brief ${request.briefId}`;
  const dateLabel = formatDateLabel(brief.periodStart);

  let executiveSummary: string | undefined;
  if (brief.summaryRef !== undefined && brief.summaryRef.trim() !== '') {
    try {
      const buf = await deps.downloadBriefBody(brief.summaryRef);
      executiveSummary = extractExecSummary(buf);
    } catch {
      /* body unavailable — render without executive block */
    }
  }

  const allSignals = await deps.loadSignals(request.workspaceId);
  const selected = selectSignalsForBrief({
    signals: allSignals,
    briefType: (brief.briefType as 'daily_workspace' | 'board_digest') ?? 'daily_workspace',
    periodStart: brief.periodStart,
    periodEnd: brief.periodEnd,
    lookbackHours: config.briefLookbackHours,
    now: now,
  });

  const subject = buildBriefEmailSubject({ title, dateLabel });
  const html = buildBriefEmailHtml({
    title,
    dateLabel,
    periodStartIso: brief.periodStart.toISOString(),
    periodEndIso: brief.periodEnd.toISOString(),
    signals: selected,
    executiveSummary,
  });
  const text = buildBriefEmailPlainText({
    title,
    dateLabel,
    signals: selected,
    executiveSummary,
  });

  const sent = await deps.sendResend(config, { to: request.to, subject, html, text }, {});
  const audit = buildEmailDeliveryRecipientAudit(request.to);

  if (sent.ok) {
    const t = deps.now();
    await deps.writeDelivery({
      db,
      workspaceId: request.workspaceId,
      deliveryId,
      doc: {
        kind: 'brief',
        status: 'sent',
        provider: 'resend',
        subject,
        recipientCount: audit.recipientCount,
        recipientDomains: audit.recipientDomains,
        recipientsMasked: audit.recipientsMasked,
        attemptedAt: now,
        sentAt: t,
        providerMessageId: sent.providerMessageId,
        briefId: request.briefId,
        createdAt: now,
        updatedAt: t,
      },
    });
    return { deliveryId, status: 'sent', providerMessageId: sent.providerMessageId };
  }

  const t2 = deps.now();
  await deps.writeDelivery({
    db,
    workspaceId: request.workspaceId,
    deliveryId,
    doc: {
      kind: 'brief',
      status: 'failed',
      provider: 'resend',
      subject,
      recipientCount: audit.recipientCount,
      recipientDomains: audit.recipientDomains,
      recipientsMasked: audit.recipientsMasked,
      attemptedAt: now,
      errorMessage: sent.message,
      briefId: request.briefId,
      createdAt: now,
      updatedAt: t2,
    },
  });

  return { deliveryId, status: 'failed', errorMessage: sent.message };
}
