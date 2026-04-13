import { randomUUID } from 'node:crypto';
import type { IntelRuntimeConfig } from '@signal/config';
import type { AlertCondition, AlertingPreferences, LatestSignalDocument } from '@signal/contracts';
import { LatestSignalDocumentSchema, MemberPreferencesDocumentSchema } from '@signal/contracts';
import type admin from 'firebase-admin';
import {
  isStoryWithinRecipientCooldown,
  recipientCooldownRoutingKey,
  recordRecipientStoryCooldown,
  resolveStoryKey,
} from './alert-story-cooldown';
import { coerceFirestoreTimestamps } from './coerce-firestore-dates';
import { evaluateRuleAgainstSignal } from './evaluate-alert-rule';
import {
  buildAlertEmailHtml,
  buildAlertEmailPlainText,
  buildAlertEmailSubject,
} from './render-alert-email';
import { sendEmailViaResend } from './resend-adapter';
import { signalMatchesUserMonitoringFilters } from './user-monitoring-scope';

const PREFS_FETCH_MAX = 200;

export type UserAlertMatch = {
  uid: string;
  email: string;
  notificationCreated: boolean;
  emailSent: boolean;
  emailStatus?: string;
  /** When the same story was already delivered to this inbox within the story cooldown window. */
  skippedStoryCooldown?: boolean;
};

export type EvaluateUserAlertsResult = {
  signalId: string;
  matchedUsers: number;
  matches: UserAlertMatch[];
};

function prefsToAlertCondition(alerting: AlertingPreferences): AlertCondition | null {
  const hasWatchCriteria =
    (alerting.watchedEntityRefs && alerting.watchedEntityRefs.length > 0) ||
    (alerting.watchedCountryCodes && alerting.watchedCountryCodes.length > 0) ||
    (alerting.watchedSignalFamilies && alerting.watchedSignalFamilies.length > 0) ||
    alerting.minImportanceScore !== undefined ||
    (alerting.enabledSourceIds && alerting.enabledSourceIds.length > 0) ||
    (alerting.geographicScope?.coverage === 'custom' &&
      (alerting.geographicScope.macroRegions?.length ?? 0) > 0) ||
    (alerting.watchedIndexIds && alerting.watchedIndexIds.length > 0);

  if (!hasWatchCriteria) return null;

  return {
    minScore: alerting.minImportanceScore,
    signalType:
      alerting.watchedSignalFamilies && alerting.watchedSignalFamilies.length === 1
        ? (alerting.watchedSignalFamilies[0] as AlertCondition['signalType'])
        : undefined,
    entityRefs: alerting.watchedEntityRefs?.map((r) => ({
      entityType: r.entityType,
      entityId: r.entityId,
    })),
    countryEntityIds: alerting.watchedCountryCodes?.map((iso2) => iso2.toLowerCase()),
  };
}

/**
 * Evaluate all member preferences against a newly promoted signal.
 * For each match: creates an in-app notification + sends email if immediate delivery is enabled.
 */
export async function evaluateUserAlertsForSignal(
  opts: { workspaceId: string; signalId: string },
  config: IntelRuntimeConfig,
  db: admin.firestore.Firestore,
): Promise<EvaluateUserAlertsResult> {
  const { workspaceId, signalId } = opts;

  const signalSnap = await db
    .collection('workspaces')
    .doc(workspaceId)
    .collection('signalsLatest')
    .doc(signalId)
    .get();

  if (!signalSnap.exists) {
    return { signalId, matchedUsers: 0, matches: [] };
  }

  const signalParsed = LatestSignalDocumentSchema.safeParse(
    coerceFirestoreTimestamps(signalSnap.data() ?? {}),
  );
  if (!signalParsed.success) {
    return { signalId, matchedUsers: 0, matches: [] };
  }
  const signal: LatestSignalDocument = signalParsed.data;

  const prefsSnap = await db
    .collection('workspaces')
    .doc(workspaceId)
    .collection('memberPreferences')
    .limit(PREFS_FETCH_MAX)
    .get();

  if (prefsSnap.empty) {
    return { signalId, matchedUsers: 0, matches: [] };
  }

  const matches: UserAlertMatch[] = [];

  for (const prefDoc of prefsSnap.docs) {
    const uid = prefDoc.id;
    const parsed = MemberPreferencesDocumentSchema.safeParse(
      coerceFirestoreTimestamps(prefDoc.data()),
    );
    if (!parsed.success) continue;

    const prefs = parsed.data;
    if (!prefs.alerting?.enabled) continue;

    const condition = prefsToAlertCondition(prefs.alerting);
    if (!condition) continue;

    const result = evaluateRuleAgainstSignal(condition, signal);
    if (!result.matched) continue;

    if (
      !signalMatchesUserMonitoringFilters(signal, prefs.alerting, {
        denyWhenNoSourceLinkedGeo: config.monitoringGeoDenyWhenNoSourceLinked,
      })
    ) {
      continue;
    }

    const memberSnap = await db
      .collection('workspaces')
      .doc(workspaceId)
      .collection('members')
      .doc(uid)
      .get();
    const memberData = memberSnap.data();
    const email = (memberData?.email as string | undefined) ?? '';

    const storyKey = resolveStoryKey(signal);
    const recipientKey = recipientCooldownRoutingKey(email, uid);
    const cooldownDays = config.userAlertStoryCooldownDays;
    if (
      await isStoryWithinRecipientCooldown({
        db,
        workspaceId,
        recipientKey,
        storyKey,
        cooldownDays,
        now: new Date(),
      })
    ) {
      matches.push({
        uid,
        email,
        notificationCreated: false,
        emailSent: false,
        emailStatus: 'skipped_story_cooldown',
        skippedStoryCooldown: true,
      });
      continue;
    }

    const now = new Date();
    const notifId = randomUUID();
    await db
      .collection('workspaces')
      .doc(workspaceId)
      .collection('notifications')
      .doc(notifId)
      .set({
        type: 'user_alert',
        title: signal.title,
        message: signal.shortSummary ?? `Signal matched your alert preferences.`,
        signalId,
        status: 'unread',
        userId: uid,
        createdAt: now,
        updatedAt: now,
      });

    let emailSent = false;
    let emailStatus = 'skipped';

    const wantsImmediate =
      prefs.alerting.cadenceMode === 'immediate' || prefs.alerting.cadenceMode === 'both';
    const emailEnabled = prefs.channels?.email !== false && prefs.notifications.emailAlerts;

    if (wantsImmediate && emailEnabled && email && config.resendEnabled) {
      const subject = buildAlertEmailSubject({
        signalTitle: signal.title,
        signalType: signal.signalType,
        shortSummary: signal.shortSummary,
      });
      const html = buildAlertEmailHtml({
        signalId,
        signalTitle: signal.title,
        signalType: signal.signalType,
        score: Math.round(signal.score),
        detectedAtIso: signal.detectedAt.toISOString(),
        shortSummary: signal.shortSummary ?? undefined,
        sourceUrl: signal.provenance?.sourceUrl,
        sourceLabel: signal.provenance?.sourceLabel,
        matchReason: 'Your alert preferences',
        entityRefs: signal.entityRefs,
      });
      const text = buildAlertEmailPlainText({
        signalId,
        signalTitle: signal.title,
        signalType: signal.signalType,
        score: Math.round(signal.score),
        detectedAtIso: signal.detectedAt.toISOString(),
        shortSummary: signal.shortSummary ?? undefined,
        sourceUrl: signal.provenance?.sourceUrl,
        sourceLabel: signal.provenance?.sourceLabel,
        matchReason: 'Your alert preferences',
        entityRefs: signal.entityRefs,
      });

      const sent = await sendEmailViaResend(config, { to: [email], subject, html, text }, {});
      emailSent = sent.ok;
      emailStatus = sent.ok ? 'sent' : (sent.message ?? 'failed');
    }

    const needEmail = wantsImmediate && emailEnabled && Boolean(email) && config.resendEnabled;
    const shouldSealCooldown = cooldownDays > 0 && (!needEmail || emailSent);
    if (shouldSealCooldown) {
      await recordRecipientStoryCooldown({
        db,
        workspaceId,
        recipientKey,
        storyKey,
        signalId,
        now,
      });
    }

    matches.push({
      uid,
      email,
      notificationCreated: true,
      emailSent,
      emailStatus,
    });
  }

  console.log(
    '[user-alerts] signal=%s matched=%d emails_sent=%d',
    signalId,
    matches.length,
    matches.filter((m) => m.emailSent).length,
  );

  return { signalId, matchedUsers: matches.length, matches };
}
