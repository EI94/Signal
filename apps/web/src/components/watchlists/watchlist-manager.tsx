'use client';

import type { EntityRef, WatchlistSummaryV1 } from '@signal/contracts';
import { Button, EmptyState, Surface } from '@signal/ui';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  createWatchlist,
  deleteWatchlist,
  fetchWatchlistDetail,
  fetchWatchlists,
  updateWatchlist,
} from '../../lib/api/fetch-watchlists';
import { getSignalApiBaseUrl } from '../../lib/api/signal-api';
import { entityPath } from '../../lib/entity-route';
import { formatCompactDate } from '../../lib/signal-display';
import { useAuth } from '../auth/auth-provider';
import { SignInToPersonalizePrompt } from '../auth/sign-in-to-personalize-prompt';

type ViewMode = 'list' | 'create' | 'detail';

type DetailState = {
  watchlistId: string;
  name: string;
  description: string;
  entityRefs: EntityRef[];
};

export function WatchlistManager() {
  const { configured, loading: authLoading, user } = useAuth();
  const apiBase = getSignalApiBaseUrl();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [watchlists, setWatchlists] = useState<WatchlistSummaryV1[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [saving, setSaving] = useState(false);

  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [entityInput, setEntityInput] = useState('');

  const loadList = useCallback(async () => {
    if (!user || !apiBase) return;
    setLoadState('loading');
    setError(null);
    try {
      const token = await user.getIdToken();
      const data = await fetchWatchlists(apiBase, token);
      setWatchlists(data.watchlists);
      setLoadState('ok');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setLoadState('error');
    }
  }, [user, apiBase]);

  useEffect(() => {
    if (!configured || authLoading || !user || !apiBase) return;
    void loadList();
  }, [configured, authLoading, user, apiBase, loadList]);

  const openDetail = useCallback(
    async (watchlistId: string) => {
      if (!user || !apiBase) return;
      setError(null);
      try {
        const token = await user.getIdToken();
        const data = await fetchWatchlistDetail(apiBase, token, watchlistId);
        setDetail({
          watchlistId: data.watchlist.watchlistId,
          name: data.watchlist.name,
          description: data.watchlist.description ?? '',
          entityRefs: data.watchlist.entityRefs,
        });
        setViewMode('detail');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load detail');
      }
    },
    [user, apiBase],
  );

  const handleCreate = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!user || !apiBase || !newName.trim()) return;
      setSaving(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const entityRefs = parseEntityInput(entityInput);
        await createWatchlist(apiBase, token, {
          name: newName.trim(),
          description: newDescription.trim() || undefined,
          entityRefs,
        });
        setNewName('');
        setNewDescription('');
        setEntityInput('');
        setViewMode('list');
        await loadList();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Create failed');
      } finally {
        setSaving(false);
      }
    },
    [user, apiBase, newName, newDescription, entityInput, loadList],
  );

  const handleSaveDetail = useCallback(async () => {
    if (!user || !apiBase || !detail) return;
    setSaving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      await updateWatchlist(apiBase, token, detail.watchlistId, {
        name: detail.name,
        description: detail.description || undefined,
        entityRefs: detail.entityRefs,
      });
      setViewMode('list');
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }, [user, apiBase, detail, loadList]);

  const handleDelete = useCallback(
    async (watchlistId: string) => {
      if (!user || !apiBase) return;
      setError(null);
      try {
        const token = await user.getIdToken();
        await deleteWatchlist(apiBase, token, watchlistId);
        setViewMode('list');
        await loadList();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed');
      }
    },
    [user, apiBase, loadList],
  );

  const removeEntityFromDetail = useCallback((idx: number) => {
    setDetail((prev) => {
      if (!prev) return prev;
      return { ...prev, entityRefs: prev.entityRefs.filter((_, i) => i !== idx) };
    });
  }, []);

  if (!configured || authLoading) return null;

  if (!user) {
    return (
      <SignInToPersonalizePrompt
        title="Sign in to manage watchlists"
        description="Create and manage personal entity watchlists to track what matters to you."
      />
    );
  }

  if (viewMode === 'create') {
    return (
      <div className="watchlists">
        {error && <p className="watchlists-error">{error}</p>}
        <Surface className="watchlists-form">
          <h2 className="watchlists-form__title">Create watchlist</h2>
          <form onSubmit={handleCreate}>
            <label className="email-auth-form__label">
              <span className="email-auth-form__label-text">Name</span>
              <input
                className="email-auth-form__input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                placeholder="My watchlist"
              />
            </label>
            <label className="email-auth-form__label">
              <span className="email-auth-form__label-text">Description</span>
              <input
                className="email-auth-form__input"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional description"
              />
            </label>
            <label className="email-auth-form__label">
              <span className="email-auth-form__label-text">
                Entities (one per line: type:id:name)
              </span>
              <textarea
                className="email-auth-form__input watchlists-textarea"
                value={entityInput}
                onChange={(e) => setEntityInput(e.target.value)}
                rows={4}
                placeholder={'company:acme-corp:Acme Corp\ncompany:globex:Globex'}
              />
            </label>
            <div className="watchlists-form__actions">
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setViewMode('list')}>
                Cancel
              </Button>
            </div>
          </form>
        </Surface>
      </div>
    );
  }

  if (viewMode === 'detail' && detail) {
    return (
      <div className="watchlists">
        {error && <p className="watchlists-error">{error}</p>}
        <Surface className="watchlists-detail">
          <div className="watchlists-detail__header">
            <input
              className="email-auth-form__input watchlists-detail__name-input"
              value={detail.name}
              onChange={(e) => setDetail({ ...detail, name: e.target.value })}
            />
            <div className="watchlists-detail__header-actions">
              <Button type="button" disabled={saving} onClick={handleSaveDetail}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void handleDelete(detail.watchlistId)}
              >
                Delete
              </Button>
              <Button type="button" variant="ghost" onClick={() => setViewMode('list')}>
                Back
              </Button>
            </div>
          </div>
          <input
            className="email-auth-form__input"
            value={detail.description}
            onChange={(e) => setDetail({ ...detail, description: e.target.value })}
            placeholder="Description"
          />
          <h3 className="watchlists-detail__section-title">
            Entities ({detail.entityRefs.length})
          </h3>
          {detail.entityRefs.length === 0 ? (
            <p className="auth-panel__muted">No entities in this watchlist.</p>
          ) : (
            <ul className="watchlists-entity-list">
              {detail.entityRefs.map((ref, idx) => (
                <li key={`${ref.entityType}:${ref.entityId}`} className="watchlists-entity-item">
                  <Link
                    href={entityPath(ref.entityType, ref.entityId)}
                    className="watchlists-entity-item__link"
                  >
                    {ref.displayName ?? ref.entityId}
                  </Link>
                  <span className="watchlists-entity-item__type">{ref.entityType}</span>
                  <Button type="button" variant="ghost" onClick={() => removeEntityFromDetail(idx)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </div>
    );
  }

  return (
    <div className="watchlists">
      {error && <p className="watchlists-error">{error}</p>}
      <div className="watchlists-toolbar">
        <Button type="button" onClick={() => setViewMode('create')}>
          New watchlist
        </Button>
      </div>
      {loadState === 'loading' && <p className="auth-panel__muted">Loading…</p>}
      {loadState === 'ok' && watchlists.length === 0 && (
        <EmptyState
          title="No watchlists yet"
          description="Create a watchlist to track the entities that matter to you."
        />
      )}
      {loadState === 'ok' && watchlists.length > 0 && (
        <div className="watchlists-grid">
          {watchlists.map((w) => (
            <button
              key={w.watchlistId}
              type="button"
              className="watchlists-card"
              onClick={() => void openDetail(w.watchlistId)}
            >
              <h3 className="watchlists-card__name">{w.name}</h3>
              {w.description && <p className="watchlists-card__desc">{w.description}</p>}
              <div className="watchlists-card__meta">
                <span>{w.entityCount} entities</span>
                <span>{formatCompactDate(w.updatedAt)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function parseEntityInput(raw: string): EntityRef[] {
  const refs: EntityRef[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(':');
    if (parts.length >= 2) {
      const entityType = parts[0]?.trim();
      const entityId = parts[1]?.trim();
      const displayName = parts.slice(2).join(':').trim() || undefined;
      if (entityType && entityId) {
        refs.push({ entityType, entityId, displayName });
      }
    }
  }
  return refs;
}
