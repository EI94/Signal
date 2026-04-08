'use client';

import type { EntityRef } from '@signal/contracts';
import type { User } from 'firebase/auth';
import { useCallback, useState } from 'react';
import {
  createWatchlist,
  fetchWatchlistDetail,
  fetchWatchlists,
  updateWatchlist,
} from '../../lib/api/fetch-watchlists';
import { getSignalApiBaseUrl } from '../../lib/api/signal-api';

type WatchState = 'idle' | 'saving' | 'done' | 'error';

export function useWatchEntity(user: User | null) {
  const [state, setState] = useState<WatchState>('idle');

  const watchEntity = useCallback(
    async (entity: EntityRef) => {
      if (!user) return;
      const base = getSignalApiBaseUrl();
      if (!base) return;

      setState('saving');
      try {
        const token = await user.getIdToken();
        const list = await fetchWatchlists(base, token);

        const wlSummary = list.watchlists[0];
        if (wlSummary) {
          const detail = await fetchWatchlistDetail(base, token, wlSummary.watchlistId);
          const existing = detail.watchlist.entityRefs;
          const alreadyExists = existing.some(
            (r) => r.entityType === entity.entityType && r.entityId === entity.entityId,
          );
          if (alreadyExists) {
            setState('done');
            return;
          }
          await updateWatchlist(base, token, wlSummary.watchlistId, {
            entityRefs: [...existing, entity],
          });
        } else {
          await createWatchlist(base, token, {
            name: 'My Watchlist',
            entityRefs: [entity],
          });
        }
        setState('done');
      } catch {
        setState('error');
      }
    },
    [user],
  );

  const reset = useCallback(() => setState('idle'), []);

  return { watchState: state, watchEntity, resetWatch: reset };
}
