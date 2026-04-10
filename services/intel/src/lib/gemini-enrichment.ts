import { GoogleGenerativeAI } from '@google/generative-ai';
import type { IntelRuntimeConfig } from '@signal/config';
import type { EntityRef } from '@signal/contracts';

export type GeminiEnrichmentResult = {
  summary: string;
  countryCodes: string[];
  cityName: string | null;
};

const ENRICHMENT_PROMPT = `You are a senior intelligence analyst at a leading energy/EPC industry intelligence firm.
You produce concise, high-value strategic briefings for C-suite executives and business development professionals.

Given a signal event extracted from industry news sources, produce a structured intelligence analysis.

ANALYSIS GUIDELINES:
- Write 3-5 sentences of executive-grade analysis, not a mere summary of the article.
- Lead with the strategic significance: WHY does this matter for the energy/EPC sector?
- Include market context: competitive positioning, sector trends, or value chain implications.
- Identify potential second-order effects: who benefits, who is at risk, what comes next.
- Use precise industry terminology (EPC, FEED, FID, CAPEX, offtake, etc.) where appropriate.
- Maintain a neutral, professional editorial tone — no speculation, no filler, no hedge words.
- If the source text is thin or only a title is available, you MUST still produce a summary using your knowledge of the entities, signal type, and industry context. Provide informed context about what this type of event typically means for the named entities. Never return an empty summary.

COUNTRY & GEOGRAPHY:
- countryCodes: ISO 3166-1 alpha-2, only countries explicitly referenced or clearly inferable.
- cityName: only if explicitly mentioned; null otherwise.

Respond ONLY with valid JSON (no markdown, no backticks, no explanation):
{"summary":"...","countryCodes":["XX"],"cityName":"...or null"}`;

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

  const textSnippet = params.rawText.length > 4000 ? params.rawText.slice(0, 4000) : params.rawText;

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
      contents: [{ role: 'user', parts: [{ text: `${ENRICHMENT_PROMPT}\n\n${userPrompt}` }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    });

    let text = result.response.text().trim();
    const fenceStart = text.indexOf('{');
    const fenceEnd = text.lastIndexOf('}');
    if (fenceStart >= 0 && fenceEnd > fenceStart) {
      text = text.slice(fenceStart, fenceEnd + 1);
    }
    const parsed = JSON.parse(text) as Record<string, unknown>;

    const summary = typeof parsed.summary === 'string' && parsed.summary.length > 10 ? parsed.summary : null;
    if (!summary) {
      console.warn('[gemini-enrichment] model returned empty/short summary for:', params.title);
      return null;
    }

    const countryCodes = Array.isArray(parsed.countryCodes)
      ? (parsed.countryCodes as unknown[])
          .filter((c): c is string => typeof c === 'string' && c.length === 2)
          .map((c) => c.toUpperCase())
      : [];

    const cityName =
      typeof parsed.cityName === 'string' && parsed.cityName.length > 0 ? parsed.cityName : null;

    return { summary, countryCodes, cityName };
  } catch (err) {
    console.warn(
      '[gemini-enrichment] call failed, continuing without enrichment:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
