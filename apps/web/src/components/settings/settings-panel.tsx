'use client';

import {
  normalizeMarketIndexTagIds,
  type AlertingPreferences,
  type CatalogSourceRowV1,
  type ChannelPreferences,
  type DigestPreferences,
  type EntityRef,
  type FullPreferencesPayload,
  type MacroRegionCode,
  type NotificationPreferences,
  type SuggestedInstitutionalSource,
} from '@signal/contracts';
import { Button, Surface } from '@signal/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

const MACRO_REGION_OPTIONS: { value: MacroRegionCode; label: string }[] = [
  { value: 'EUROPE', label: 'Europe' },
  { value: 'MIDDLE_EAST_AFRICA', label: 'Middle East & Africa' },
  { value: 'AMERICAS', label: 'Americas' },
  { value: 'ASIA_PACIFIC', label: 'Asia–Pacific' },
  { value: 'OCEANIA', label: 'Oceania' },
];

/** Canonical ids (lowercase) — align extraction `market_index` entity ids with these labels. */
const SUGGESTED_MARKET_INDICES: { id: string; label: string }[] = [
  { id: 'spx', label: 'S&P 500' },
  { id: 'ndx', label: 'Nasdaq-100' },
  { id: 'dji', label: 'Dow Jones' },
  { id: 'eurostoxx50', label: 'EURO STOXX 50' },
  { id: 'ftse100', label: 'FTSE 100' },
  { id: 'msci_world', label: 'MSCI World' },
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
  geographicScope: { coverage: 'world', macroRegions: [] },
  enabledSourceIds: [],
  watchedIndexIds: [],
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
  const [catalogSources, setCatalogSources] = useState<CatalogSourceRowV1[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [suggestQuery, setSuggestQuery] = useState('');
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedInstitutionalSource[] | null>(null);
  const [suggestErr, setSuggestErr] = useState<string | null>(null);
  const [draftBusyUrl, setDraftBusyUrl] = useState<string | null>(null);
  const [draftMsg, setDraftMsg] = useState<string | null>(null);

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

  useEffect(() => {
    if (!user || !apiBase || !prefs.alerting?.enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`${apiBase}/v1/catalog/sources`, { headers });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { sources?: CatalogSourceRowV1[] };
        if (body.sources) {
          setCatalogSources(body.sources);
          setCatalogLoaded(true);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, apiBase, authHeaders, prefs.alerting?.enabled]);

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
      if (res.ok) {
        setDirty(false);
        setPrefs((p) => ({
          ...p,
          alerting: p.alerting
            ? {
                ...p.alerting,
                watchedIndexIds: normalizeMarketIndexTagIds(p.alerting.watchedIndexIds ?? []),
              }
            : p.alerting,
        }));
      }
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
      const res = await fetch(`${apiBase}/v1/me/test-alert`, {
        method: 'POST',
        headers,
        body: '{}',
      });
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
      const res = await fetch(`${apiBase}/v1/me/test-digest`, {
        method: 'POST',
        headers,
        body: '{}',
      });
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

  const handleSuggestSources = useCallback(async () => {
    if (!user || !apiBase) return;
    setSuggestBusy(true);
    setSuggestErr(null);
    setSuggestions(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBase}/v1/me/suggest-entity-sources`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ entityQuery: suggestQuery.trim() }),
      });
      const body = (await res.json()) as {
        error?: { message?: string };
        suggestions?: SuggestedInstitutionalSource[];
      };
      if (!res.ok) {
        setSuggestErr(body.error?.message ?? 'Suggestions unavailable');
        return;
      }
      setSuggestions(body.suggestions ?? []);
    } catch {
      setSuggestErr('Network error.');
    } finally {
      setSuggestBusy(false);
    }
  }, [user, apiBase, authHeaders, suggestQuery]);

  const handleSaveSourceDraft = useCallback(
    async (s: SuggestedInstitutionalSource) => {
      if (!user || !apiBase) return;
      setDraftMsg(null);
      setDraftBusyUrl(s.url);
      try {
        const headers = await authHeaders();
        const res = await fetch(`${apiBase}/v1/me/source-drafts`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            proposedName: s.title,
            proposedUrl: s.url,
            category: s.kind,
            rationale: s.credibilityNote,
            fromGeminiSuggestion: true,
          }),
        });
        const body = (await res.json()) as { draftId?: string; error?: { message?: string } };
        if (!res.ok) {
          setDraftMsg(body.error?.message ?? 'Could not save draft');
          return;
        }
        setDraftMsg(
          body.draftId ? `Draft saved (${body.draftId.slice(0, 8)}…); pending review.` : 'Draft saved.',
        );
      } catch {
        setDraftMsg('Network error.');
      } finally {
        setDraftBusyUrl(null);
      }
    },
    [user, apiBase, authHeaders],
  );

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

  const toggleSuggestedMarketIndex = useCallback((canonicalId: string) => {
    setPrefs((prev) => {
      const cur = normalizeMarketIndexTagIds(prev.alerting?.watchedIndexIds ?? []);
      const set = new Set(cur);
      if (set.has(canonicalId)) set.delete(canonicalId);
      else set.add(canonicalId);
      const next = [...set].sort((a, b) => a.localeCompare(b));
      return {
        ...prev,
        alerting: {
          ...(prev.alerting ?? DEFAULT_ALERTING),
          watchedIndexIds: next,
        },
      };
    });
    setDirty(true);
    setSaveMsg(null);
  }, []);

  const canonicalWatchedIndexIds = useMemo(
    () => normalizeMarketIndexTagIds((prefs.alerting ?? DEFAULT_ALERTING).watchedIndexIds ?? []),
    [prefs.alerting],
  );

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

            <div className="settings-subsection">
              <h3 className="settings-subsection__title">Geographic focus</h3>
              <p className="settings-section__desc">
                Applies when signals carry country metadata. Worldwide includes all regions.
              </p>
              <div className="settings-radio-group">
                <label className="settings-radio">
                  <input
                    type="radio"
                    name="geoCoverage"
                    checked={(alerting.geographicScope?.coverage ?? 'world') === 'world'}
                    onChange={() =>
                      update('alerting', {
                        geographicScope: { coverage: 'world', macroRegions: [] },
                      } as Partial<AlertingPreferences>)
                    }
                  />
                  <span>Worldwide</span>
                </label>
                <label className="settings-radio">
                  <input
                    type="radio"
                    name="geoCoverage"
                    checked={alerting.geographicScope?.coverage === 'custom'}
                    onChange={() =>
                      update('alerting', {
                        geographicScope: {
                          coverage: 'custom',
                          macroRegions: alerting.geographicScope?.macroRegions ?? [],
                        },
                      } as Partial<AlertingPreferences>)
                    }
                  />
                  <span>Selected regions</span>
                </label>
              </div>
              {alerting.geographicScope?.coverage === 'custom' && (
                <div className="settings-chip-list">
                  {MACRO_REGION_OPTIONS.map((r) => {
                    const selected =
                      alerting.geographicScope?.macroRegions?.includes(r.value) ?? false;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        className={`settings-chip ${selected ? 'settings-chip--active' : ''}`}
                        onClick={() => {
                          const cur = alerting.geographicScope?.macroRegions ?? [];
                          const next = selected
                            ? cur.filter((x) => x !== r.value)
                            : [...cur, r.value];
                          update('alerting', {
                            geographicScope: { coverage: 'custom', macroRegions: next },
                          } as Partial<AlertingPreferences>);
                        }}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="settings-subsection">
              <h3 className="settings-subsection__title">Sources to monitor</h3>
              <p className="settings-section__desc">
                Leave all unchecked to use the full ingested catalog. Tick specific feeds to narrow
                which origins can trigger your alerts.
              </p>
              {catalogLoaded && catalogSources.length > 0 ? (
                <div className="settings-entity-list">
                  {catalogSources.slice(0, 100).map((src) => {
                    const on = (alerting.enabledSourceIds ?? []).includes(src.sourceId);
                    return (
                      <label
                        key={src.sourceId}
                        className="settings-toggle"
                        style={{ alignItems: 'flex-start' }}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            const cur = new Set(alerting.enabledSourceIds ?? []);
                            if (on) cur.delete(src.sourceId);
                            else cur.add(src.sourceId);
                            update('alerting', {
                              enabledSourceIds: [...cur],
                            } as Partial<AlertingPreferences>);
                          }}
                        />
                        <span className="settings-toggle__text">
                          <strong>{src.name}</strong>
                          <span className="settings-toggle__hint">
                            {src.category} · score {src.authorityScore}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="settings-empty-hint">
                  {prefs.alerting?.enabled
                    ? 'Loading catalog or no active sources in the registry.'
                    : ''}
                </p>
              )}
            </div>

            <div className="settings-subsection">
              <h3 className="settings-subsection__title">Market indices (optional)</h3>
              <p className="settings-section__desc">
                The signed-in signals feed and your alerts filter to these index tags. Use presets or
                type custom ids (they are stored lowercase, matching extraction{' '}
                <code>market_index</code> entity ids).
              </p>
              <p className="settings-field__label" style={{ marginBottom: 8 }}>
                Quick add
              </p>
              <div className="settings-chip-list">
                {SUGGESTED_MARKET_INDICES.map(({ id, label }) => {
                  const on = canonicalWatchedIndexIds.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`settings-chip ${on ? 'settings-chip--active' : ''}`}
                      onClick={() => toggleSuggestedMarketIndex(id)}
                    >
                      {label}
                      <span className="settings-toggle__hint" style={{ marginLeft: 6 }}>
                        ({id})
                      </span>
                    </button>
                  );
                })}
              </div>
              <label className="settings-field">
                <span className="settings-field__label">Custom ids (comma-separated)</span>
                <input
                  type="text"
                  value={(alerting.watchedIndexIds ?? []).join(', ')}
                  onChange={(e) => {
                    const parts = e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    update('alerting', { watchedIndexIds: parts } as Partial<AlertingPreferences>);
                  }}
                  onBlur={(e) => {
                    const parts = e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const n = normalizeMarketIndexTagIds(parts);
                    update('alerting', { watchedIndexIds: n } as Partial<AlertingPreferences>);
                  }}
                  placeholder="e.g. spx, eurostoxx50"
                />
              </label>
              {canonicalWatchedIndexIds.length > 0 && (
                <p className="settings-toggle__hint" style={{ marginTop: 8 }}>
                  Stored tokens:{' '}
                  <strong>{canonicalWatchedIndexIds.join(', ')}</strong>
                </p>
              )}
            </div>

            <div className="settings-subsection">
              <h3 className="settings-subsection__title">Institutional sources (AI assist)</h3>
              <p className="settings-section__desc">
                Gemini proposes official IR / regulatory / statistics URLs — review before adding to
                your registry.
              </p>
              <div className="settings-inline-fields">
                <label className="settings-field" style={{ flex: 1 }}>
                  <span className="settings-field__label">Entity or topic</span>
                  <input
                    type="text"
                    value={suggestQuery}
                    onChange={(e) => setSuggestQuery(e.target.value)}
                    placeholder="e.g. Johnson Matthey plc investor relations"
                  />
                </label>
                <Button
                  type="button"
                  disabled={suggestBusy || suggestQuery.trim().length < 2}
                  onClick={() => void handleSuggestSources()}
                >
                  {suggestBusy ? 'Thinking…' : 'Suggest sources'}
                </Button>
              </div>
              {suggestErr && <p className="settings-empty-hint">{suggestErr}</p>}
              {draftMsg && <p className="settings-empty-hint">{draftMsg}</p>}
              {suggestions && suggestions.length > 0 && (
                <ul className="settings-entity-list">
                  {suggestions.map((s) => (
                    <li key={s.url} className="settings-entity-tag" style={{ display: 'block' }}>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title}
                      </a>
                      <div className="settings-toggle__hint">{s.kind}</div>
                      <p className="settings-section__desc" style={{ marginTop: 4 }}>
                        {s.credibilityNote}
                      </p>
                      <div style={{ marginTop: 8 }}>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={draftBusyUrl === s.url}
                          onClick={() => void handleSaveSourceDraft(s)}
                        >
                          {draftBusyUrl === s.url ? 'Saving…' : 'Save draft for review'}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
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
