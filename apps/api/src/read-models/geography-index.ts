import {
  BUSINESS_ENTITY_SEEDS_COLLECTION,
  isCountryGeography,
  lookupGeographyMeta,
} from '@signal/contracts';
import type admin from 'firebase-admin';

type TextPattern = { re: RegExp; iso2: string };

export type GeographyEntityIndex = {
  /** Maps "geography:<entityId>" → ISO2 for country-kind entities. */
  readonly entityIdToIso2: Map<string, string>;
  /** Maps organization entityId → ISO2 for HQ-country fallback. */
  readonly orgHqCountry: Map<string, string>;
  /**
   * Deterministic text inference built from seeded geography canonical names + aliases.
   * Replaces the static ALIAS_PATTERNS from geography-iso.ts with data-driven patterns.
   */
  inferFromText(text: string): string[];
};

const ORG_HQ_MAP: Record<string, string> = {
  maire: 'IT',
  tecnimont: 'IT',
  nextchem: 'IT',
  stamicarbon: 'NL',
  'kt-kinetics-technology': 'IT',
  saipem: 'IT',
  'technip-energies': 'FR',
  kbr: 'US',
  worley: 'AU',
  wood: 'GB',
  'samsung-ea': 'KR',
  mcdermott: 'US',
  'lummus-technology': 'US',
  'honeywell-uop': 'US',
  topsoe: 'DK',
  'thyssenkrupp-uhde': 'DE',
  casale: 'CH',
  'johnson-matthey': 'GB',
  totalenergies: 'FR',
  adnoc: 'AE',
  'saudi-aramco': 'SA',
  satorp: 'SA',
  qatarenergy: 'QA',
  'chevron-phillips-chemical': 'QA',
  fertiglobe: 'AE',
  'oci-global': 'NL',
  sonatrach: 'DZ',
  kazmunaygas: 'KZ',
  socar: 'AZ',
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTextPatterns(
  snap: admin.firestore.QuerySnapshot,
  entityIdToIso2: Map<string, string>,
): TextPattern[] {
  const patterns: TextPattern[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const iso2 =
      (data.iso2 as string | undefined) ?? entityIdToIso2.get(`geography:${data.entityId}`);
    if (!iso2) continue;

    const canonical = data.canonicalName as string | undefined;
    if (canonical && canonical.length >= 2) {
      patterns.push({
        re: new RegExp(`\\b${escapeRegex(canonical)}\\b`, 'i'),
        iso2,
      });
    }

    const aliases = data.aliases as string[] | undefined;
    if (aliases) {
      for (const alias of aliases) {
        const trimmed = alias.trim();
        if (trimmed.length < 2) continue;
        const isUpperAcronym = /^[A-Z.]{2,6}$/.test(trimmed);
        patterns.push({
          re: new RegExp(`\\b${escapeRegex(trimmed)}\\b`, isUpperAcronym ? undefined : 'i'),
          iso2,
        });
      }
    }
  }
  return patterns;
}

/**
 * Build a geography entity index from Firestore business entity seeds.
 * Now also builds text inference patterns from canonical names + aliases.
 */
export async function buildGeographyEntityIndex(
  db: admin.firestore.Firestore,
  workspaceId: string,
): Promise<GeographyEntityIndex> {
  const entityIdToIso2 = new Map<string, string>();
  const orgHqCountry = new Map<string, string>();

  const seedsCol = db.collection(`workspaces/${workspaceId}/${BUSINESS_ENTITY_SEEDS_COLLECTION}`);
  const snap = await seedsCol.where('entityType', '==', 'geography').get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const iso2 = data.iso2 as string | undefined;
    if (iso2 && data.entityId) {
      entityIdToIso2.set(`geography:${data.entityId}`, iso2);
    }
    if (!iso2 && data.canonicalName) {
      const meta = lookupGeographyMeta(data.canonicalName as string);
      if (meta && isCountryGeography(meta)) {
        entityIdToIso2.set(`geography:${data.entityId}`, meta.iso2);
      }
    }
  }

  for (const [slug, iso2] of Object.entries(ORG_HQ_MAP)) {
    orgHqCountry.set(slug, iso2);
  }

  const textPatterns = buildTextPatterns(snap, entityIdToIso2);

  function inferFromText(text: string): string[] {
    const found = new Set<string>();
    for (const { re, iso2 } of textPatterns) {
      if (re.test(text)) found.add(iso2);
    }
    return [...found];
  }

  return { entityIdToIso2, orgHqCountry, inferFromText };
}
