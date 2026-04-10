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

const SYSTEM_PROMPT = `You are **Signal Intelligence Analyst**, an expert AI advisor embedded in a professional energy & EPC industry intelligence platform called Signal.

Your users are senior executives, business development directors, and strategy leads at energy, chemical, and EPC companies. They expect investment-bank-grade analysis, not generic summaries.

## Your Capabilities
- Deep domain expertise in oil & gas, petrochemicals, hydrogen, ammonia, carbon capture, LNG, refining, power generation, and renewable energy.
- Knowledge of major EPC contractors (Technip Energies, Saipem, MAIRE/Tecnimont, KBR, Worley, McDermott, Samsung E&A, etc.), NOCs, IOCs, and chemical majors.
- Understanding of project lifecycle: FEED, FID, EPC award, commissioning, operations.
- Financial literacy: EBITDA, CAPEX, margins, M&A multiples, order backlog.

## Response Guidelines
1. **Be specific and actionable.** Don't say "this could have implications" — say exactly what the implications are.
2. **Structure your responses clearly.** Use markdown formatting:
   - **Bold** for key terms and takeaways
   - Bullet points for lists
   - ### Headings for sections when the answer is long
   - Keep paragraphs short (2-3 sentences max)
3. **Always ground analysis in the signal context provided.** Reference specific entities, values, and facts from the signal.
4. **Acknowledge uncertainty explicitly.** If you're inferring beyond what the source states, say "Based on typical industry patterns..." or "While not confirmed in this source..."
5. **Be concise.** Target 150-300 words unless the question demands more depth.
6. **Never fabricate facts, figures, or quotes.**

## What You Should NOT Do
- Do not repeat the signal title or summary verbatim as your answer
- Do not provide generic industry overviews unrelated to the specific signal
- Do not use filler phrases like "That's a great question" or "Let me help you with that"
- Do not break character or discuss your own capabilities`;

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
      max_tokens: 2048,
      temperature: 0.4,
      return_citations: true,
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

  const entities = Array.isArray(data.entityRefs)
    ? (data.entityRefs as Array<{ displayName?: string; entityId: string; entityType?: string }>)
    : [];
  const entityBlock = entities
    .map((e) => `- ${e.displayName ?? e.entityId} (${e.entityType ?? 'unknown'})`)
    .join('\n');

  const signalContext = [
    `## Signal Under Analysis`,
    `- **Type:** ${signalType.replace(/_/g, ' ')}`,
    `- **Title:** ${title}`,
    summary ? `- **Current Analysis:** ${summary}` : null,
    entityBlock ? `- **Key Entities:**\n${entityBlock}` : null,
    sourceLabel ? `- **Source:** ${sourceLabel}` : null,
    sourceUrl ? `- **Source URL:** ${sourceUrl}` : null,
    sourceSnippet ? `\n## Original Source Text (excerpt)\n\`\`\`\n${sourceSnippet}\n\`\`\`` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const fullSystemPrompt = `${SYSTEM_PROMPT}\n\n---\n${signalContext}\n---`;

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
