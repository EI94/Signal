import type { SuggestEntitySourcesRequest, SuggestedInstitutionalSource } from '@signal/contracts';
import { SuggestedInstitutionalSourceSchema } from '@signal/contracts';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta';

function buildPrompt(req: SuggestEntitySourcesRequest): string {
  const hint = req.entityTypeHint ? `Entity type hint: ${req.entityTypeHint}.` : '';
  return `You configure sources for a regulated business-intelligence platform (energy / infrastructure).
The user wants to monitor this subject: "${req.entityQuery}".
${hint}

Return a JSON array ONLY (no markdown) of 3 to 6 suggested institutional sources the user could add to their watchlist.
Each item must be an object with:
- "title": short human label
- "url": absolute https URL on an official or clearly institutional domain (IR site, regulator, stock exchange listing, national statistics office, company official newsroom — never blogs, social media, or SEO spam)
- "kind": one of "issuer_investor_relations", "regulator", "statistics_office", "stock_exchange", "official_company", "other"
- "credibilityNote": one sentence on why this source is appropriate for serious intelligence work

If you are unsure of the exact URL, propose the best canonical homepage you can (still https).`;
}

export async function suggestInstitutionalSourcesViaGemini(params: {
  apiKey: string;
  model: string;
  request: SuggestEntitySourcesRequest;
}): Promise<SuggestedInstitutionalSource[]> {
  const { apiKey, model, request } = params;
  const url = `${GEMINI_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(request) }] }],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`gemini_http_${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('gemini_empty_response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('gemini_invalid_json');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('gemini_expected_array');
  }

  const out: SuggestedInstitutionalSource[] = [];
  for (const row of parsed) {
    const v = SuggestedInstitutionalSourceSchema.safeParse(row);
    if (v.success) out.push(v.data);
  }
  return out.slice(0, 12);
}
