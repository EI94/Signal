import type { FullPreferencesPayload } from '@signal/contracts';

/**
 * Loads the signed-in member preferences (GET `/v1/me/preferences`).
 * Returns null when unauthenticated or on non-OK response.
 */
export async function fetchMemberPreferences(
  apiBase: string,
  idToken: string | null | undefined,
): Promise<FullPreferencesPayload | null> {
  if (!idToken) return null;
  const res = await fetch(`${apiBase}/v1/me/preferences`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { preferences?: FullPreferencesPayload };
  return body.preferences ?? null;
}
