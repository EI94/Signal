'use client';

import type {
  AlertingPreferences,
  ChannelPreferences,
  DigestPreferences,
  EntityRef,
  FullPreferencesPayload,
  NotificationPreferences,
} from '@signal/contracts';
import { Button, Surface } from '@signal/ui';
import { useCallback, useEffect, useState } from 'react';
import { getSignalApiBaseUrl } from '../../lib/api/signal-api';
import { useAuth } from '../auth/auth-provider';
import { SignInToPersonalizePrompt } from '../auth/sign-in-to-personalize-prompt';

const SIGNAL_FAMILIES = [
  { value: 'project_award', label: 'Project Award' },
  { value: 'partnership_mou', label: 'Partnership / MoU' },
  { value: 'earnings_reporting_update', label: 'Earnings / Reporting' },
  { value: 'ma_divestment', label: 'M&A / Divestment' },
  { value: 'technology_milestone', label: 'Technology Milestone' },
];

const DEFAULT_DIGEST: DigestPreferences = {
  enabled: true,
  deliveryTime: '08:00',
  timezone: 'Europe/Rome',
};
const DEFAULT_CHANNELS: ChannelPreferences = { email: true, whatsapp: false };
const DEFAULT_ALERTING: AlertingPreferences = {
  enabled: false,
  watchedEntityRefs: [],
  watchedCountryCodes: [],
  watchedSignalFamilies: [],
  minImportanceScore: 50,
  cadenceMode: 'both',
};
const DEFAULT_PREFS: FullPreferencesPayload = {
  notifications: { emailAlerts: true, emailBriefs: true },
  digest: DEFAULT_DIGEST,
  channels: DEFAULT_CHANNELS,
  alerting: DEFAULT_ALERTING,
};

type WatchlistSummary = { watchlistId: string; name: string; entityRefs: EntityRef[] };

export function SettingsPanel() {
  const { configured, loading, user, signOutUser, sendVerificationEmail } = useAuth();
  const apiBase = getSignalApiBaseUrl();

  const [prefs, setPrefs] = useState<FullPreferencesPayload>(DEFAULT_PREFS);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [verifySending, setVerifySending] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const [testingAlert, setTestingAlert] = useState(false);
  const [testAlertMsg, setTestAlertMsg] = useState<string | null>(null);
  const [testingDigest, setTestingDigest] = useState(false);
  const [testDigestMsg, setTestDigestMsg] = useState<string | null>(null);
  const [watchlists, setWatchlists] = useState<WatchlistSummary[]>([]);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!user) return {};
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }, [user]);

  useEffect(() => {
    if (!user || !apiBase) return;
    let cancelled = false;
    void (async () => {
      try {
        const headers = await authHeaders();
        const [prefsRes, wlRes] = await Promise.all([
          fetch(`${apiBase}/v1/me/preferences`, { headers }),
          fetch(`${apiBase}/v1/watchlists`, { headers }),
        ]);
        if (!cancelled && prefsRes.ok) {
          const body = (await prefsRes.json()) as { preferences?: FullPreferencesPayload };
          if (body.preferences) setPrefs({ ...DEFAULT_PREFS, ...body.preferences });
        }
        if (!cancelled && wlRes.ok) {
          const body = (await wlRes.json()) as { watchlists?: WatchlistSummary[] };
          if (body.watchlists) setWatchlists(body.watchlists);
        }
      } catch {
        /* use defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, apiBase, authHeaders]);

  const update = useCallback(
    <K extends keyof FullPreferencesPayload>(
      section: K,
      patch: Partial<FullPreferencesPayload[K]>,
    ) => {
      setPrefs((prev) => ({
        ...prev,
        [section]: { ...(prev[section] as Record<string, unknown>), ...patch },
      }));
      setDirty(true);
      setSaveMsg(null);
    },
    [],
  );

  const savePrefs = useCallback(async () => {
    if (!user || !apiBase) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBase}/v1/me/preferences`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ preferences: prefs }),
      });
      setSaveMsg(res.ok ? 'Preferences saved.' : 'Failed to save.');
      if (res.ok) setDirty(false);
    } catch {
      setSaveMsg('Network error.');
    } finally {
      setSaving(false);
    }
  }, [user, apiBase, prefs, authHeaders]);

  const handleTestAlert = useCallback(async () => {
    if (!user || !apiBase) return;
    setTestingAlert(true);
    setTestAlertMsg(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBase}/v1/me/test-alert`, { method: 'POST', headers });
      const body = (await res.json()) as { status?: string; message?: string };
      setTestAlertMsg(
        body.status === 'sent' ? `Test alert sent to ${user.email}` : (body.message ?? 'Failed'),
      );
    } catch {
      setTestAlertMsg('Network error.');
    } finally {
      setTestingAlert(false);
    }
  }, [user, apiBase, authHeaders]);

  const handleTestDigest = useCallback(async () => {
    if (!user || !apiBase) return;
    setTestingDigest(true);
    setTestDigestMsg(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBase}/v1/me/test-digest`, { method: 'POST', headers });
      const body = (await res.json()) as { status?: string; message?: string };
      setTestDigestMsg(
        body.status === 'sent' ? `Digest sent to ${user.email}` : (body.message ?? 'Failed'),
      );
    } catch {
      setTestDigestMsg('Network error.');
    } finally {
      setTestingDigest(false);
    }
  }, [user, apiBase, authHeaders]);

  const handleResendVerification = useCallback(async () => {
    setVerifySending(true);
    try {
      await sendVerificationEmail();
      setVerifySent(true);
    } catch {
      /* rate limit */
    } finally {
      setVerifySending(false);
    }
  }, [sendVerificationEmail]);

  const toggleFamily = useCallback((family: string) => {
    setPrefs((prev) => {
      const current = prev.alerting?.watchedSignalFamilies ?? [];
      const next = current.includes(family)
        ? current.filter((f) => f !== family)
        : [...current, family];
      return {
        ...prev,
        alerting: { ...(prev.alerting ?? DEFAULT_ALERTING), watchedSignalFamilies: next },
      };
    });
    setDirty(true);
    setSaveMsg(null);
  }, []);

  const importFromWatchlist = useCallback((wl: WatchlistSummary) => {
    setPrefs((prev) => {
      const existing = prev.alerting?.watchedEntityRefs ?? [];
      const newRefs = wl.entityRefs.filter(
        (nr) =>
          !existing.some((er) => er.entityType === nr.entityType && er.entityId === nr.entityId),
      );
      return {
        ...prev,
        alerting: {
          ...(prev.alerting ?? DEFAULT_ALERTING),
          watchedEntityRefs: [...existing, ...newRefs],
        },
      };
    });
    setDirty(true);
    setSaveMsg(null);
  }, []);

  const removeWatchedEntity = useCallback((entityType: string, entityId: string) => {
    setPrefs((prev) => ({
      ...prev,
      alerting: {
        ...(prev.alerting ?? DEFAULT_ALERTING),
        watchedEntityRefs: (prev.alerting?.watchedEntityRefs ?? []).filter(
          (r) => !(r.entityType === entityType && r.entityId === entityId),
        ),
      },
    }));
    setDirty(true);
    setSaveMsg(null);
  }, []);

  if (!configured || loading) return null;

  if (!user) {
    return (
      <SignInToPersonalizePrompt
        title="Sign in to access settings"
        description="Manage your account, notification preferences, alert rules and delivery channels."
      />
    );
  }

  const notif = prefs.notifications;
  const digest = prefs.digest ?? DEFAULT_DIGEST;
  const channels = prefs.channels ?? DEFAULT_CHANNELS;
  const alerting = prefs.alerting ?? DEFAULT_ALERTING;

  return (
    <div className="settings">
      {/* Account */}
      <Surface className="settings-section">
        <h2 className="settings-section__title">Account</h2>
        <div className="settings-account">
          <div className="settings-account__row">
            <span className="settings-account__label">Email</span>
            <span className="settings-account__value">{user.email ?? '—'}</span>
          </div>
          <div className="settings-account__row">
            <span className="settings-account__label">Display name</span>
            <span className="settings-account__value">{user.displayName ?? '—'}</span>
          </div>
          <div className="settings-account__row">
            <span className="settings-account__label">Email verified</span>
            <span className="settings-account__value">
              {user.emailVerified ? (
                'Yes'
              ) : (
                <span className="settings-account__unverified">
                  Not verified
                  {!verifySent && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={verifySending}
                      onClick={handleResendVerification}
                    >
                      {verifySending ? 'Sending…' : 'Resend'}
                    </Button>
                  )}
                  {verifySent && <span className="settings-account__sent">Sent!</span>}
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="settings-section__footer">
          <Button type="button" variant="ghost" onClick={() => void signOutUser()}>
            Sign out
          </Button>
        </div>
      </Surface>

      {/* Channels */}
      <Surface className="settings-section">
        <h2 className="settings-section__title">Delivery channels</h2>
        <div className="settings-toggles">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={channels.email}
              onChange={() =>
                update('channels', { email: !channels.email } as Partial<ChannelPreferences>)
              }
            />
            <span className="settings-toggle__text">
              <strong>Email</strong>
              <span className="settings-toggle__hint">Receive alerts and digests via email.</span>
            </span>
          </label>
          <label className="settings-toggle settings-toggle--disabled">
            <input type="checkbox" checked={false} disabled />
            <span className="settings-toggle__text">
              <strong>WhatsApp</strong>
              <span className="settings-toggle__hint settings-toggle__coming-soon">
                Coming soon
              </span>
            </span>
          </label>
        </div>
      </Surface>

      {/* Notifications */}
      <Surface className="settings-section">
        <h2 className="settings-section__title">Notification preferences</h2>
        <div className="settings-toggles">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={notif.emailAlerts}
              onChange={() =>
                update('notifications', {
                  emailAlerts: !notif.emailAlerts,
                } as Partial<NotificationPreferences>)
              }
            />
            <span className="settings-toggle__text">
              <strong>Alert emails</strong>
              <span className="settings-toggle__hint">
                Immediate email when a matching signal fires.
              </span>
            </span>
          </label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={notif.emailBriefs}
              onChange={() =>
                update('notifications', {
                  emailBriefs: !notif.emailBriefs,
                } as Partial<NotificationPreferences>)
              }
            />
            <span className="settings-toggle__text">
              <strong>Brief emails</strong>
              <span className="settings-toggle__hint">Morning brief summary by email.</span>
            </span>
          </label>
        </div>
      </Surface>

      {/* Digest */}
      <Surface className="settings-section">
        <h2 className="settings-section__title">Daily digest</h2>
        <div className="settings-toggles">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={digest.enabled}
              onChange={() =>
                update('digest', { enabled: !digest.enabled } as Partial<DigestPreferences>)
              }
            />
            <span className="settings-toggle__text">
              <strong>Enable daily digest</strong>
            </span>
          </label>
        </div>
        {digest.enabled && (
          <div className="settings-inline-fields">
            <label className="settings-field">
              <span className="settings-field__label">Delivery time</span>
              <input
                type="time"
                value={digest.deliveryTime ?? '08:00'}
                onChange={(e) =>
                  update('digest', { deliveryTime: e.target.value } as Partial<DigestPreferences>)
                }
              />
            </label>
            <label className="settings-field">
              <span className="settings-field__label">Timezone</span>
              <select
                value={digest.timezone ?? 'Europe/Rome'}
                onChange={(e) =>
                  update('digest', { timezone: e.target.value } as Partial<DigestPreferences>)
                }
              >
                <option value="Europe/Rome">Europe/Rome</option>
                <option value="Europe/London">Europe/London</option>
                <option value="Europe/Paris">Europe/Paris</option>
                <option value="America/New_York">America/New_York</option>
                <option value="Asia/Dubai">Asia/Dubai</option>
                <option value="Asia/Singapore">Asia/Singapore</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
          </div>
        )}
      </Surface>

      {/* Alert personalization */}
      <Surface className="settings-section">
        <h2 className="settings-section__title">Alert personalization</h2>
        <p className="settings-section__desc">Configure what triggers immediate alerts for you.</p>
        <div className="settings-toggles">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={alerting.enabled}
              onChange={() =>
                update('alerting', { enabled: !alerting.enabled } as Partial<AlertingPreferences>)
              }
            />
            <span className="settings-toggle__text">
              <strong>Enable personalized alerts</strong>
            </span>
          </label>
        </div>

        {alerting.enabled && (
          <>
            <div className="settings-subsection">
              <h3 className="settings-subsection__title">Cadence</h3>
              <div className="settings-radio-group">
                {(['immediate', 'digest', 'both'] as const).map((mode) => (
                  <label key={mode} className="settings-radio">
                    <input
                      type="radio"
                      name="cadence"
                      checked={alerting.cadenceMode === mode}
                      onChange={() =>
                        update('alerting', { cadenceMode: mode } as Partial<AlertingPreferences>)
                      }
                    />
                    <span>
                      {mode === 'immediate'
                        ? 'Immediate only'
                        : mode === 'digest'
                          ? 'Digest only'
                          : 'Both'}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="settings-subsection">
              <h3 className="settings-subsection__title">Minimum importance</h3>
              <div className="settings-slider">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={alerting.minImportanceScore ?? 50}
                  onChange={(e) =>
                    update('alerting', {
                      minImportanceScore: Number(e.target.value),
                    } as Partial<AlertingPreferences>)
                  }
                />
                <span className="settings-slider__value">{alerting.minImportanceScore ?? 50}</span>
              </div>
            </div>

            <div className="settings-subsection">
              <h3 className="settings-subsection__title">Signal families</h3>
              <div className="settings-chip-list">
                {SIGNAL_FAMILIES.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    className={`settings-chip ${(alerting.watchedSignalFamilies ?? []).includes(f.value) ? 'settings-chip--active' : ''}`}
                    onClick={() => toggleFamily(f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-subsection">
              <h3 className="settings-subsection__title">Watched entities</h3>
              {watchlists.length > 0 && (
                <div className="settings-import-row">
                  <span className="settings-field__label">Import from watchlist:</span>
                  {watchlists.map((wl) => (
                    <Button
                      key={wl.watchlistId}
                      type="button"
                      variant="ghost"
                      onClick={() => importFromWatchlist(wl)}
                    >
                      {wl.name}
                    </Button>
                  ))}
                </div>
              )}
              <div className="settings-entity-list">
                {(alerting.watchedEntityRefs ?? []).map((ref) => (
                  <div key={`${ref.entityType}:${ref.entityId}`} className="settings-entity-tag">
                    <span className="settings-entity-tag__type">{ref.entityType}</span>
                    <span>{ref.displayName ?? ref.entityId}</span>
                    <button
                      type="button"
                      className="settings-entity-tag__remove"
                      onClick={() => removeWatchedEntity(ref.entityType, ref.entityId)}
                    >
                      &times;
                    </button>
                  </div>
                ))}
                {(alerting.watchedEntityRefs ?? []).length === 0 && (
                  <p className="settings-empty-hint">
                    No entities watched. Import from a watchlist above.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </Surface>

      {/* Save */}
      <div className="settings-save-bar">
        {saveMsg && <span className="settings-save-bar__msg">{saveMsg}</span>}
        <Button type="button" disabled={saving || !dirty} onClick={() => void savePrefs()}>
          {saving ? 'Saving…' : 'Save all preferences'}
        </Button>
      </div>

      {/* Test CTAs */}
      <Surface className="settings-section">
        <h2 className="settings-section__title">Test delivery</h2>
        <p className="settings-section__desc">Send yourself a real test to verify your setup.</p>
        <div className="settings-test-ctas">
          <div className="settings-test-cta">
            <Button type="button" disabled={testingAlert} onClick={() => void handleTestAlert()}>
              {testingAlert ? 'Sending…' : 'Send me a test alert'}
            </Button>
            {testAlertMsg && <span className="settings-test-cta__msg">{testAlertMsg}</span>}
          </div>
          <div className="settings-test-cta">
            <Button type="button" disabled={testingDigest} onClick={() => void handleTestDigest()}>
              {testingDigest ? 'Generating…' : 'Send me a test digest'}
            </Button>
            {testDigestMsg && <span className="settings-test-cta__msg">{testDigestMsg}</span>}
          </div>
        </div>
      </Surface>
    </div>
  );
}
