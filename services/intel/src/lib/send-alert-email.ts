import { randomUUID } from 'node:crypto';
import type { IntelRuntimeConfig } from '@signal/config';
import type {
  AlertRuleDocument,
  LatestSignalDocument,
  SendAlertEmailRequest,
  SendEmailDeliveryResponse,
} from '@signal/contracts';
import { AlertRuleDocumentSchema, LatestSignalDocumentSchema } from '@signal/contracts';
import type admin from 'firebase-admin';
import { coerceFirestoreTimestamps } from './coerce-firestore-dates';
import { buildEmailDeliveryRecipientAudit } from './email-delivery-recipient-audit';
import { getFirestoreDb } from './firebase-admin';
import { writeEmailDeliveryDocument } from './record-email-delivery';
import {
  buildAlertEmailHtml,
  buildAlertEmailPlainText,
  buildAlertEmailSubject,
} from './render-alert-email';
import { sendEmailViaResend } from './resend-adapter';

export type SendAlertEmailDeps = {
  loadRule: (workspaceId: string, ruleId: string) => Promise<AlertRuleDocument | null>;
  loadSignal: (workspaceId: string, signalId: string) => Promise<LatestSignalDocument | null>;
  sendResend: typeof sendEmailViaResend;
  writeDelivery: typeof writeEmailDeliveryDocument;
  /** Override for tests; default uses `getFirestoreDb`. */
  getFirestore?: () => admin.firestore.Firestore;
  now: () => Date;
  randomId: () => string;
};

export function createDefaultSendAlertEmailDeps(_config: IntelRuntimeConfig): SendAlertEmailDeps {
  return {
    getFirestore: () => getFirestoreDb(),
    loadRule: async (workspaceId, ruleId) => {
      const snap = await getFirestoreDb()
        .collection('workspaces')
        .doc(workspaceId)
        .collection('alertRules')
        .doc(ruleId)
        .get();
      if (!snap.exists) return null;
      const parsed = AlertRuleDocumentSchema.safeParse(
        coerceFirestoreTimestamps(snap.data() ?? {}),
      );
      return parsed.success ? parsed.data : null;
    },
    loadSignal: async (workspaceId, signalId) => {
      const snap = await getFirestoreDb()
        .collection('workspaces')
        .doc(workspaceId)
        .collection('signalsLatest')
        .doc(signalId)
        .get();
      if (!snap.exists) return null;
      const parsed = LatestSignalDocumentSchema.safeParse(
        coerceFirestoreTimestamps(snap.data() ?? {}),
      );
      return parsed.success ? parsed.data : null;
    },
    sendResend: sendEmailViaResend,
    writeDelivery: writeEmailDeliveryDocument,
    now: () => new Date(),
    randomId: randomUUID,
  };
}

export async function sendAlertEmail(
  request: SendAlertEmailRequest & { workspaceId: string },
  config: IntelRuntimeConfig,
  deps: SendAlertEmailDeps,
): Promise<SendEmailDeliveryResponse> {
  const deliveryId = deps.randomId();
  const now = deps.now();

  if (!config.resendEnabled) {
    return {
      deliveryId,
      status: 'skipped',
      skippedReason: 'resend_disabled',
    };
  }

  if (request.to.length > config.emailMaxRecipientsPerRequest) {
    return {
      deliveryId,
      status: 'skipped',
      skippedReason: 'recipient_cap_exceeded',
    };
  }

  const db = deps.getFirestore?.() ?? getFirestoreDb();

  const [rule, signal] = await Promise.all([
    deps.loadRule(request.workspaceId, request.alertRuleId),
    deps.loadSignal(request.workspaceId, request.signalId),
  ]);
  const audit = buildEmailDeliveryRecipientAudit(request.to);

  if (!rule || !signal) {
    const subject = buildAlertEmailSubject({
      signalTitle: signal?.title ?? request.signalId,
    });
    await deps.writeDelivery({
      db,
      workspaceId: request.workspaceId,
      deliveryId,
      doc: {
        kind: 'alert',
        status: 'failed',
        provider: 'resend',
        subject,
        recipientCount: audit.recipientCount,
        recipientDomains: audit.recipientDomains,
        recipientsMasked: audit.recipientsMasked,
        attemptedAt: now,
        errorMessage: !rule ? 'alert_rule_not_found' : 'signal_not_found',
        alertRuleId: request.alertRuleId,
        signalId: request.signalId,
        evaluationReference: request.evaluationReference,
        createdAt: now,
        updatedAt: now,
      },
    });
    return {
      deliveryId,
      status: 'failed',
      errorMessage: !rule ? 'alert_rule_not_found' : 'signal_not_found',
    };
  }

  const detectedAtIso = signal.detectedAt.toISOString();
  const subject = buildAlertEmailSubject({ signalTitle: signal.title });
  const html = buildAlertEmailHtml({
    signalId: request.signalId,
    signalTitle: signal.title,
    signalType: signal.signalType,
    score: Math.round(signal.score),
    detectedAtIso,
    shortSummary: signal.shortSummary ?? undefined,
    sourceUrl: signal.provenance?.sourceUrl,
    sourceLabel: signal.provenance?.sourceLabel,
    matchReason: `Rule: ${rule.name}`,
  });
  const text = buildAlertEmailPlainText({
    signalId: request.signalId,
    signalTitle: signal.title,
    signalType: signal.signalType,
    score: Math.round(signal.score),
    detectedAtIso,
    shortSummary: signal.shortSummary ?? undefined,
    sourceUrl: signal.provenance?.sourceUrl,
    sourceLabel: signal.provenance?.sourceLabel,
    matchReason: `Rule: ${rule.name}`,
  });

  const sent = await deps.sendResend(config, { to: request.to, subject, html, text }, {});

  if (sent.ok) {
    await deps.writeDelivery({
      db,
      workspaceId: request.workspaceId,
      deliveryId,
      doc: {
        kind: 'alert',
        status: 'sent',
        provider: 'resend',
        subject,
        recipientCount: audit.recipientCount,
        recipientDomains: audit.recipientDomains,
        recipientsMasked: audit.recipientsMasked,
        attemptedAt: now,
        sentAt: deps.now(),
        providerMessageId: sent.providerMessageId,
        alertRuleId: request.alertRuleId,
        signalId: request.signalId,
        evaluationReference: request.evaluationReference,
        createdAt: now,
        updatedAt: deps.now(),
      },
    });
    return {
      deliveryId,
      status: 'sent',
      providerMessageId: sent.providerMessageId,
    };
  }

  await deps.writeDelivery({
    db,
    workspaceId: request.workspaceId,
    deliveryId,
    doc: {
      kind: 'alert',
      status: 'failed',
      provider: 'resend',
      subject,
      recipientCount: audit.recipientCount,
      recipientDomains: audit.recipientDomains,
      recipientsMasked: audit.recipientsMasked,
      attemptedAt: now,
      errorMessage: sent.message,
      alertRuleId: request.alertRuleId,
      signalId: request.signalId,
      evaluationReference: request.evaluationReference,
      createdAt: now,
      updatedAt: deps.now(),
    },
  });

  return {
    deliveryId,
    status: 'failed',
    errorMessage: sent.message,
  };
}
