/**
 * Static ISO mapping for known MAIRE geography entities.
 * Keyed by canonical name (lowercase) → { iso2, iso3, geographyKind, regionGroup }.
 * Countries have iso2/iso3; regions/subregions do not.
 */

export type GeographyMeta = {
  readonly iso2?: string;
  readonly iso3?: string;
  readonly geographyKind: 'country' | 'region' | 'subregion';
  readonly regionGroup?: string;
};

const GEOGRAPHY_MAP: Record<string, GeographyMeta> = {
  'middle east': { geographyKind: 'region' },
  'united arab emirates': {
    iso2: 'AE',
    iso3: 'ARE',
    geographyKind: 'country',
    regionGroup: 'Middle East',
  },
  'saudi arabia': { iso2: 'SA', iso3: 'SAU', geographyKind: 'country', regionGroup: 'Middle East' },
  qatar: { iso2: 'QA', iso3: 'QAT', geographyKind: 'country', regionGroup: 'Middle East' },
  oman: { iso2: 'OM', iso3: 'OMN', geographyKind: 'country', regionGroup: 'Middle East' },
  iraq: { iso2: 'IQ', iso3: 'IRQ', geographyKind: 'country', regionGroup: 'Middle East' },
  kuwait: { iso2: 'KW', iso3: 'KWT', geographyKind: 'country', regionGroup: 'Middle East' },
  africa: { geographyKind: 'region' },
  'north africa': { geographyKind: 'subregion', regionGroup: 'Africa' },
  algeria: { iso2: 'DZ', iso3: 'DZA', geographyKind: 'country', regionGroup: 'Africa' },
  'west africa': { geographyKind: 'subregion', regionGroup: 'Africa' },
  'sub-saharan africa': { geographyKind: 'subregion', regionGroup: 'Africa' },
  'southern africa': { geographyKind: 'subregion', regionGroup: 'Africa' },
  egypt: { iso2: 'EG', iso3: 'EGY', geographyKind: 'country', regionGroup: 'Africa' },
  morocco: { iso2: 'MA', iso3: 'MAR', geographyKind: 'country', regionGroup: 'Africa' },
  nigeria: { iso2: 'NG', iso3: 'NGA', geographyKind: 'country', regionGroup: 'Africa' },
  angola: { iso2: 'AO', iso3: 'AGO', geographyKind: 'country', regionGroup: 'Africa' },
  'caspian area': { geographyKind: 'region' },
  kazakhstan: { iso2: 'KZ', iso3: 'KAZ', geographyKind: 'country', regionGroup: 'Caspian Area' },
  azerbaijan: { iso2: 'AZ', iso3: 'AZE', geographyKind: 'country', regionGroup: 'Caspian Area' },
  europe: { geographyKind: 'region' },
  italy: { iso2: 'IT', iso3: 'ITA', geographyKind: 'country', regionGroup: 'Europe' },
  france: { iso2: 'FR', iso3: 'FRA', geographyKind: 'country', regionGroup: 'Europe' },
  'united kingdom': { iso2: 'GB', iso3: 'GBR', geographyKind: 'country', regionGroup: 'Europe' },
  germany: { iso2: 'DE', iso3: 'DEU', geographyKind: 'country', regionGroup: 'Europe' },
  netherlands: { iso2: 'NL', iso3: 'NLD', geographyKind: 'country', regionGroup: 'Europe' },
  poland: { iso2: 'PL', iso3: 'POL', geographyKind: 'country', regionGroup: 'Europe' },
  'north america': { geographyKind: 'region' },
  'united states': {
    iso2: 'US',
    iso3: 'USA',
    geographyKind: 'country',
    regionGroup: 'North America',
  },
  mexico: { iso2: 'MX', iso3: 'MEX', geographyKind: 'country', regionGroup: 'North America' },
  brazil: { iso2: 'BR', iso3: 'BRA', geographyKind: 'country', regionGroup: 'South America' },
  china: { iso2: 'CN', iso3: 'CHN', geographyKind: 'country', regionGroup: 'Asia Pacific' },
  india: { iso2: 'IN', iso3: 'IND', geographyKind: 'country', regionGroup: 'Asia Pacific' },
  indonesia: { iso2: 'ID', iso3: 'IDN', geographyKind: 'country', regionGroup: 'Asia Pacific' },
  australia: { iso2: 'AU', iso3: 'AUS', geographyKind: 'country', regionGroup: 'Asia Pacific' },
  'south-east asia': { geographyKind: 'subregion', regionGroup: 'Asia Pacific' },
};

export function lookupGeographyMeta(canonicalName: string): GeographyMeta | null {
  return GEOGRAPHY_MAP[canonicalName.toLowerCase()] ?? null;
}

export function isCountryGeography(
  meta: GeographyMeta,
): meta is GeographyMeta & { iso2: string; iso3: string } {
  return meta.geographyKind === 'country' && !!meta.iso2;
}

export function getAllCountryIso2Codes(): string[] {
  return Object.values(GEOGRAPHY_MAP)
    .filter((m): m is GeographyMeta & { iso2: string } => m.geographyKind === 'country' && !!m.iso2)
    .map((m) => m.iso2);
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getCountryNameByIso2(iso2: string): string | null {
  for (const [name, meta] of Object.entries(GEOGRAPHY_MAP)) {
    if (meta.iso2 === iso2) {
      return titleCase(name);
    }
  }
  return null;
}

/**
 * Deterministic text-inference: match known country names/aliases in a title string.
 * Returns ISO2 codes found. Not NLP — pure substring matching against known geography.
 */
const TEXT_INFERENCE_PATTERNS: [RegExp, string][] = Object.entries(GEOGRAPHY_MAP)
  .filter(([, m]) => m.geographyKind === 'country' && m.iso2)
  .map(([name, m]) => [
    new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
    m.iso2 as string,
  ]);

const ALIAS_PATTERNS: [RegExp, string][] = [
  [/\bUAE\b/i, 'AE'],
  [/\bAbu Dhabi\b/i, 'AE'],
  [/\bKSA\b/i, 'SA'],
  [/\bUK\b/, 'GB'],
  [/\bBritain\b/i, 'GB'],
  [/\bUSA\b/, 'US'],
  [/\bU\.S\.\b/, 'US'],
  [/\bRas Laffan\b/i, 'QA'],
  [/\bPRC\b/, 'CN'],
];

export function inferCountryCodesFromText(text: string): string[] {
  const found = new Set<string>();
  for (const [re, iso2] of TEXT_INFERENCE_PATTERNS) {
    if (re.test(text)) found.add(iso2);
  }
  for (const [re, iso2] of ALIAS_PATTERNS) {
    if (re.test(text)) found.add(iso2);
  }
  return [...found];
}
