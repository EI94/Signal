import { GoogleGenerativeAI } from '@google/generative-ai';
import type { IntelRuntimeConfig } from '@signal/config';
import { downloadObjectBytes } from './download-object';
import { getFirestoreDb, initFirebaseAdmin } from './firebase-admin';
import { parseGcsUri } from './gcs-uri';
import { querySourceContentMetadata } from './query-source-content-metadata';

export type SignalChatRequest = {
  workspaceId: string;
  signalId: string;
  message: string;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
  provider?: 'gemini' | 'perplexity';
};

export type SignalChatResponse = {
  reply: string;
  provider: 'gemini' | 'perplexity';
  citations?: string[];
};

const SYSTEM_PROMPT = `You are Signal Intelligence Analyst, an AI assistant for an energy/EPC industry intelligence platform.
You are helping a user understand a specific signal (news event) that was detected by the platform.

Context about the signal will be provided. Answer the user's questions about this signal with:
- Professional, factual tone
- Industry expertise in energy, EPC, chemicals, hydrogen, ammonia
- Clear analysis of implications and context
- When you don't know something, say so clearly

Keep answers concise but thorough. Use bullet points when listing multiple items.`;

let cachedGeminiClient: GoogleGenerativeAI | null = null;
function getGeminiClient(apiKey: string): GoogleGenerativeAI {
  if (!cachedGeminiClient) cachedGeminiClient = new GoogleGenerativeAI(apiKey);
  return cachedGeminiClient;
}

async function chatWithPerplexity(
  config: IntelRuntimeConfig,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
): Promise<{ reply: string; citations: string[] }> {
  const resp = await fetch(`${config.perplexityBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.perplexityApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.perplexityModel,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: 1024,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(config.perplexityTimeoutMs),
  });
  if (!resp.ok) throw new Error(`Perplexity API error: ${resp.status}`);
  const json = (await resp.json()) as Record<string, unknown>;
  const choices = json.choices as Array<{ message: { content: string } }> | undefined;
  const reply = choices?.[0]?.message?.content ?? '';
  const citations = Array.isArray(json.citations) ? (json.citations as string[]) : [];
  return { reply, citations };
}

export async function handleSignalChat(
  req: SignalChatRequest,
  config: IntelRuntimeConfig,
): Promise<SignalChatResponse> {
  initFirebaseAdmin(config.firebaseProjectId);
  const db = getFirestoreDb();

  const snap = await db
    .collection('workspaces')
    .doc(req.workspaceId)
    .collection('signalsLatest')
    .doc(req.signalId)
    .get();
  if (!snap.exists) throw new Error('signal_not_found');
  const data = snap.data() as Record<string, unknown>;

  const title = typeof data.title === 'string' ? data.title : '';
  const summary =
    typeof data.enrichedSummary === 'string'
      ? data.enrichedSummary
      : typeof data.shortSummary === 'string'
        ? data.shortSummary
        : '';
  const signalType = typeof data.signalType === 'string' ? data.signalType : '';
  const entityRefs = Array.isArray(data.entityRefs)
    ? (data.entityRefs as Array<{ displayName?: string; entityId: string }>)
        .map((e) => e.displayName ?? e.entityId)
        .join(', ')
    : '';
  const provenance =
    typeof data.provenance === 'object' && data.provenance
      ? (data.provenance as Record<string, unknown>)
      : {};
  const sourceUrl = typeof provenance.sourceUrl === 'string' ? provenance.sourceUrl : '';
  const sourceLabel = typeof provenance.sourceLabel === 'string' ? provenance.sourceLabel : '';

  let sourceSnippet = '';
  const contentRef = typeof provenance.contentRef === 'string' ? provenance.contentRef : null;
  if (contentRef) {
    try {
      const meta = await querySourceContentMetadata({
        projectId: config.firebaseProjectId,
        datasetId: config.bigQueryDatasetId,
        tableId: config.bigQuerySourceContentsTableId,
        sourceContentId: contentRef,
      });
      if (meta?.normalizedGcsUri) {
        const loc = parseGcsUri(meta.normalizedGcsUri);
        const buf = await downloadObjectBytes({
          projectId: config.firebaseProjectId,
          bucketName: loc.bucket,
          objectKey: loc.objectKey,
        });
        sourceSnippet = buf.toString('utf8').slice(0, 6000);
      }
    } catch {
      /* best effort */
    }
  }

  const signalContext = [
    `Signal type: ${signalType}`,
    `Title: ${title}`,
    `Summary: ${summary}`,
    `Entities: ${entityRefs}`,
    `Source: ${sourceLabel} (${sourceUrl})`,
    sourceSnippet ? `\nSource text excerpt:\n${sourceSnippet}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const fullSystemPrompt = `${SYSTEM_PROMPT}\n\n--- SIGNAL CONTEXT ---\n${signalContext}\n--- END CONTEXT ---`;

  const provider = req.provider ?? (config.perplexityEnabled ? 'perplexity' : 'gemini');

  if (provider === 'perplexity' && config.perplexityEnabled && config.perplexityApiKey) {
    const messages = [
      ...(req.history ?? []).map((h) => ({
        role: h.role === 'model' ? 'assistant' : 'user',
        content: h.text,
      })),
      { role: 'user', content: req.message },
    ];
    const result = await chatWithPerplexity(config, fullSystemPrompt, messages);
    return { reply: result.reply, provider: 'perplexity', citations: result.citations };
  }

  if (!config.geminiEnabled || !config.geminiApiKey) {
    throw new Error('no_llm_provider_available');
  }

  const client = getGeminiClient(config.geminiApiKey);
  const model = client.getGenerativeModel({
    model: config.geminiModel,
    systemInstruction: fullSystemPrompt,
  });

  const chat = model.startChat({
    history: (req.history ?? []).map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    })),
  });

  const result = await chat.sendMessage(req.message);
  const reply = result.response.text();

  return { reply, provider: 'gemini' };
}
