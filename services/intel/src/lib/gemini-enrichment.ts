import { GoogleGenerativeAI } from '@google/generative-ai';
import type { IntelRuntimeConfig } from '@signal/config';
import type { EntityRef } from '@signal/contracts';

export type GeminiEnrichmentResult = {
  summary: string;
  countryCodes: string[];
  cityName: string | null;
};

const ENRICHMENT_PROMPT = `You are a senior intelligence analyst at an energy/EPC industry intelligence service.
Given a signal event extracted from news sources, produce a structured analysis.

Rules:
- Summary: 2-3 sentences, professional editorial tone, factual only. No filler phrases.
- Country codes: ISO 3166-1 alpha-2, only countries explicitly mentioned or clearly implied.
- City: only if explicitly mentioned in the text.
- If information is insufficient, return what you can. Never fabricate.

Respond ONLY with valid JSON (no markdown, no backticks):
{"summary":"...","countryCodes":["XX","YY"],"cityName":"...or null"}`;

let cachedClient: GoogleGenerativeAI | null = null;

function getClient(apiKey: string): GoogleGenerativeAI {
  if (!cachedClient) {
    cachedClient = new GoogleGenerativeAI(apiKey);
  }
  return cachedClient;
}

export async function enrichSignalWithGemini(
  config: IntelRuntimeConfig,
  params: {
    title: string;
    rawText: string;
    entityRefs: EntityRef[];
    signalType: string;
  },
): Promise<GeminiEnrichmentResult | null> {
  if (!config.geminiEnabled || !config.geminiApiKey) return null;

  const entityList = params.entityRefs
    .map((e) => `${e.entityType}: ${e.displayName ?? e.entityId}`)
    .join(', ');

  const textSnippet = params.rawText.length > 4000
    ? params.rawText.slice(0, 4000)
    : params.rawText;

  const userPrompt = [
    `Signal type: ${params.signalType}`,
    `Title: ${params.title}`,
    `Entities: ${entityList}`,
    `Source text excerpt:\n${textSnippet}`,
  ].join('\n\n');

  try {
    const client = getClient(config.geminiApiKey);
    const model = client.getGenerativeModel({ model: config.geminiModel });
    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: ENRICHMENT_PROMPT + '\n\n' + userPrompt }] },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
      },
    });

    const text = result.response.text().trim();
    const parsed = JSON.parse(text) as Record<string, unknown>;

    const summary = typeof parsed.summary === 'string' ? parsed.summary : null;
    if (!summary) return null;

    const countryCodes = Array.isArray(parsed.countryCodes)
      ? (parsed.countryCodes as unknown[])
          .filter((c): c is string => typeof c === 'string' && c.length === 2)
          .map((c) => c.toUpperCase())
      : [];

    const cityName = typeof parsed.cityName === 'string' && parsed.cityName.length > 0
      ? parsed.cityName
      : null;

    return { summary, countryCodes, cityName };
  } catch (err) {
    console.warn('[gemini-enrichment] call failed, continuing without enrichment:', err instanceof Error ? err.message : err);
    return null;
  }
}
