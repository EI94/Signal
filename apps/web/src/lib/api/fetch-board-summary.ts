import type { BoardSummaryV1Response } from '@signal/contracts';

export class BoardSummaryFetchError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | null,
  ) {
    super(message);
    this.name = 'BoardSummaryFetchError';
  }
}

/**
 * Fetch the board summary from the serving API.
 * When `idToken` is null/undefined, calls public read-only mode (no Authorization header).
 */
export async function fetchBoardSummary(
  apiBase: string,
  idToken: string | null | undefined,
): Promise<BoardSummaryV1Response> {
  const headers: Record<string, string> = {};
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }
  const res = await fetch(`${apiBase}/v1/board/summary`, {
    headers,
  });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const message = extractApiErrorMessage(body) ?? `HTTP ${res.status}`;
    throw new BoardSummaryFetchError(message, res.status);
  }

  return (await res.json()) as BoardSummaryV1Response;
}

function extractApiErrorMessage(body: unknown): string | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return null;
}
