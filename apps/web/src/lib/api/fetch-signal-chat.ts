import { getSignalApiBaseUrl } from './signal-api';

export type ChatMessage = {
  role: 'user' | 'model';
  text: string;
};

export type ChatResponse = {
  reply: string;
  provider: 'gemini' | 'perplexity';
  citations?: string[];
};

export async function fetchSignalChat(
  signalId: string,
  message: string,
  history: ChatMessage[],
  provider?: 'gemini' | 'perplexity',
): Promise<ChatResponse> {
  const apiBase = getSignalApiBaseUrl();
  if (!apiBase) throw new Error('API base URL not configured');

  const res = await fetch(`${apiBase}/v1/signals/${encodeURIComponent(signalId)}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, provider }),
  });
  if (!res.ok) throw new Error(`Chat failed: HTTP ${res.status}`);
  const json = (await res.json()) as { ok: boolean; result: ChatResponse };
  return json.result;
}
