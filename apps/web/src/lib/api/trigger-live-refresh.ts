import { getSignalApiBaseUrl } from './signal-api';

export async function triggerLiveRefresh(): Promise<boolean> {
  const apiBase = getSignalApiBaseUrl();
  if (!apiBase) return false;

  try {
    const res = await fetch(`${apiBase}/v1/pulse/live-refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}
