import type { IntelRuntimeConfig } from '@signal/config';

export type ResendSendEmailParams = {
  readonly to: readonly string[];
  readonly subject: string;
  readonly html: string;
  readonly text?: string;
};

export type ResendSendEmailSuccess = {
  readonly ok: true;
  readonly providerMessageId: string;
};

export type ResendSendEmailFailure = {
  readonly ok: false;
  readonly message: string;
  readonly httpStatus?: number;
};

/**
 * Minimal Resend HTTP client (no SDK). Call only when `config.resendEnabled` and keys are set.
 */
export async function sendEmailViaResend(
  config: IntelRuntimeConfig,
  params: ResendSendEmailParams,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<ResendSendEmailSuccess | ResendSendEmailFailure> {
  const apiKey = config.resendApiKey;
  const from = config.resendFromEmail;
  if (!config.resendEnabled || !apiKey || !from) {
    return { ok: false, message: 'resend_not_configured' };
  }

  const fromHeader = config.resendFromName ? `${config.resendFromName} <${from}>` : from;

  const body: Record<string, unknown> = {
    from: fromHeader,
    to: [...params.to],
    subject: params.subject,
    html: params.html,
  };
  if (params.text !== undefined) {
    body.text = params.text;
  }
  if (config.resendReplyTo) {
    body.reply_to = config.resendReplyTo;
  }

  const fetchFn = deps.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, config.resendTimeoutMs);

  let res: Response;
  try {
    res = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : 'fetch_failed';
    return { ok: false, message };
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    return { ok: false, message: 'resend_response_not_json', httpStatus: res.status };
  }

  if (!res.ok) {
    const msg =
      typeof json === 'object' && json !== null && 'message' in json
        ? String((json as { message: unknown }).message)
        : text || `resend_http_${res.status}`;
    return { ok: false, message: msg, httpStatus: res.status };
  }

  const id =
    typeof json === 'object' &&
    json !== null &&
    'id' in json &&
    typeof (json as { id: unknown }).id === 'string'
      ? (json as { id: string }).id
      : null;

  if (!id) {
    return { ok: false, message: 'resend_missing_id', httpStatus: res.status };
  }

  return { ok: true, providerMessageId: id };
}
