import type { IntelRuntimeConfig } from '@signal/config';
import type {
  SummarizeDeltaToolInput,
  SummarizeDeltaToolOutput,
  UsageMeteringOutcome,
} from '@signal/contracts';
import { SummarizeDeltaProviderResultSchema } from '@signal/contracts';
import { meterIntelPerplexity } from './record-usage-metering';

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Agent API requires `provider/model`; legacy env used bare ids like `sonar`. */
function normalizeModelForAgentApi(model: string): string {
  const m = model.trim();
  if (!m) return 'perplexity/sonar';
  return m.includes('/') ? m : `perplexity/${m}`;
}

/** Aggregates `output_text` blocks from Agent API `output` messages (non-streaming). */
function extractAgentOutputText(envelope: unknown): string | null {
  if (!envelope || typeof envelope !== 'object') return null;
  const output = (envelope as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    if ((item as { type?: string }).type !== 'message') continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      if ((block as { type?: string }).type !== 'output_text') continue;
      const text = (block as { text?: unknown }).text;
      if (typeof text === 'string' && text.length > 0) parts.push(text);
    }
  }
  return parts.length ? parts.join('') : null;
}

function stripJsonFence(text: string): string {
  const t = text.trim();
  if (!t.startsWith('```')) {
    return t;
  }
  const withoutOpen = t.replace(/^```(?:json)?\s*/i, '');
  const end = withoutOpen.lastIndexOf('```');
  if (end !== -1) {
    return withoutOpen.slice(0, end).trim();
  }
  return t;
}

function buildUserPrompt(input: SummarizeDeltaToolInput): string {
  return [
    'You must respond with a single JSON object only, no markdown fences, no text outside JSON.',
    'Keys: "conciseSummary" (string), "keyPoints" (array of 1–12 short strings), optional "confidenceNote" (string).',
    '',
    `Title: ${input.title}`,
    `Source type: ${input.sourceType ?? 'unspecified'}`,
    `Signal type: ${input.signalType ?? 'unspecified'}`,
    `Source content id: ${input.sourceContentId ?? 'n/a'}`,
    `Entities: ${input.entityNames?.length ? input.entityNames.join(', ') : 'none'}`,
    `Authority / context: ${input.sourceAuthority ?? 'n/a'}`,
    '',
    'Excerpt to summarize:',
    input.shortSummary,
  ].join('\n');
}

export type PerplexitySummarizeDeps = {
  fetchImpl?: typeof fetch;
};

/**
 * Optional Perplexity call for `summarize_delta` only. Does not run on deterministic pipeline routes.
 */
export async function callPerplexitySummarizeDelta(
  config: IntelRuntimeConfig,
  input: SummarizeDeltaToolInput,
  deps: PerplexitySummarizeDeps = {},
): Promise<
  { ok: true; output: SummarizeDeltaToolOutput } | { ok: false; message: string; details?: unknown }
> {
  const t0 = Date.now();
  const meterPplx = (outcome: UsageMeteringOutcome) => {
    void meterIntelPerplexity(config, {
      outcome,
      durationMs: Date.now() - t0,
      sourceContentId: input.sourceContentId,
    });
  };

  const apiKey = config.perplexityApiKey;
  if (!config.perplexityEnabled || !apiKey) {
    meterPplx('skipped');
    return { ok: false, message: 'perplexity_not_configured' };
  }

  const fetchFn = deps.fetchImpl ?? globalThis.fetch;
  const model = normalizeModelForAgentApi(config.perplexityModel);
  const url = `${normalizeBaseUrl(config.perplexityBaseUrl)}/v1/agent`;

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, config.perplexityTimeoutMs);

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions:
          'You are a precise analyst for Signal. Follow the user instructions exactly. Output only JSON.',
        input: buildUserPrompt(input),
        max_output_tokens: 2048,
        stream: false,
        tools: [],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      meterPplx('failed');
      return {
        ok: false,
        message: 'perplexity_timeout',
        details: { timeoutMs: config.perplexityTimeoutMs },
      };
    }
    meterPplx('failed');
    return { ok: false, message: 'perplexity_network_error', details: { cause: String(err) } };
  }
  clearTimeout(timeout);

  const rawText = await res.text();

  if (!res.ok) {
    let details: unknown = rawText.slice(0, 500);
    try {
      details = rawText ? JSON.parse(rawText) : null;
    } catch {
      /* keep truncated text */
    }
    meterPplx('failed');
    return {
      ok: false,
      message: `perplexity_http_${res.status}`,
      details,
    };
  }

  let envelope: unknown;
  try {
    envelope = rawText ? JSON.parse(rawText) : null;
  } catch {
    meterPplx('failed');
    return {
      ok: false,
      message: 'perplexity_response_not_json',
      details: { status: res.status, text: rawText.slice(0, 500) },
    };
  }

  if (
    envelope &&
    typeof envelope === 'object' &&
    envelope !== null &&
    'error' in envelope &&
    (envelope as { error?: unknown }).error
  ) {
    meterPplx('failed');
    return {
      ok: false,
      message: 'perplexity_agent_error',
      details: (envelope as { error: unknown }).error,
    };
  }

  if (
    envelope &&
    typeof envelope === 'object' &&
    envelope !== null &&
    (envelope as { status?: string }).status === 'failed'
  ) {
    meterPplx('failed');
    return { ok: false, message: 'perplexity_response_failed', details: envelope };
  }

  const content = extractAgentOutputText(envelope);

  if (content === null || content === '') {
    meterPplx('failed');
    return { ok: false, message: 'perplexity_empty_completion', details: envelope };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripJsonFence(content));
  } catch {
    meterPplx('failed');
    return {
      ok: false,
      message: 'perplexity_completion_not_json',
      details: { content: content.slice(0, 800) },
    };
  }

  const validated = SummarizeDeltaProviderResultSchema.safeParse(parsedJson);
  if (!validated.success) {
    meterPplx('failed');
    return {
      ok: false,
      message: 'perplexity_output_schema_mismatch',
      details: validated.error.flatten(),
    };
  }

  const latencyMs = Date.now() - t0;
  const resolvedModel =
    envelope &&
    typeof envelope === 'object' &&
    envelope !== null &&
    'model' in envelope &&
    typeof (envelope as { model: unknown }).model === 'string'
      ? (envelope as { model: string }).model
      : model;
  const output: SummarizeDeltaToolOutput = {
    ...validated.data,
    provider: { id: 'perplexity', model: resolvedModel, latencyMs },
  };

  meterPplx('ok');
  return { ok: true, output };
}
