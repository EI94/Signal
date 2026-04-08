import type {
  CreateWatchlistRequest,
  UpdateWatchlistRequest,
  WatchlistDetailV1Response,
  WatchlistsListV1Response,
} from '@signal/contracts';

export async function fetchWatchlists(
  apiBase: string,
  token: string,
): Promise<WatchlistsListV1Response> {
  const res = await fetch(`${apiBase}/v1/watchlists`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to load watchlists: HTTP ${res.status}`);
  return (await res.json()) as WatchlistsListV1Response;
}

export async function fetchWatchlistDetail(
  apiBase: string,
  token: string,
  watchlistId: string,
): Promise<WatchlistDetailV1Response> {
  const res = await fetch(`${apiBase}/v1/watchlists/${encodeURIComponent(watchlistId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to load watchlist: HTTP ${res.status}`);
  return (await res.json()) as WatchlistDetailV1Response;
}

export async function createWatchlist(
  apiBase: string,
  token: string,
  body: CreateWatchlistRequest,
): Promise<WatchlistDetailV1Response> {
  const res = await fetch(`${apiBase}/v1/watchlists`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to create watchlist: HTTP ${res.status}`);
  return (await res.json()) as WatchlistDetailV1Response;
}

export async function updateWatchlist(
  apiBase: string,
  token: string,
  watchlistId: string,
  body: UpdateWatchlistRequest,
): Promise<WatchlistDetailV1Response> {
  const res = await fetch(`${apiBase}/v1/watchlists/${encodeURIComponent(watchlistId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to update watchlist: HTTP ${res.status}`);
  return (await res.json()) as WatchlistDetailV1Response;
}

export async function deleteWatchlist(
  apiBase: string,
  token: string,
  watchlistId: string,
): Promise<void> {
  const res = await fetch(`${apiBase}/v1/watchlists/${encodeURIComponent(watchlistId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to delete watchlist: HTTP ${res.status}`);
}
