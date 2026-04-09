#!/usr/bin/env tsx
/**
 * Seed additional market/industry sources into the Firestore source registry.
 *
 * Usage:
 *   FIREBASE_PROJECT_ID=signal-ac219 npx tsx scripts/seed-market-sources.ts [--apply]
 *
 * Without --apply, prints what would be written (dry-run).
 */
import { createHash } from 'node:crypto';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const SOURCES = [
  {
    canonicalUrl: 'https://www.reuters.com/business/energy/',
    name: 'Reuters Energy',
    sourceType: 'web_page' as const,
    category: 'general_market' as const,
    priorityTier: 'p1_high' as const,
    checkFrequencyBucket: 'every_6h' as const,
    authorityScore: 95,
  },
  {
    canonicalUrl: 'https://www.upstreamonline.com/latest',
    name: 'Upstream Online',
    sourceType: 'web_page' as const,
    category: 'general_market' as const,
    priorityTier: 'p1_high' as const,
    checkFrequencyBucket: 'every_6h' as const,
    authorityScore: 90,
  },
  {
    canonicalUrl: 'https://www.meed.com/sectors/energy',
    name: 'MEED Energy',
    sourceType: 'web_page' as const,
    category: 'general_market' as const,
    priorityTier: 'p1_high' as const,
    checkFrequencyBucket: 'daily' as const,
    authorityScore: 90,
  },
  {
    canonicalUrl: 'https://www.argusmedia.com/en/news',
    name: 'Argus Media',
    sourceType: 'web_page' as const,
    category: 'general_market' as const,
    priorityTier: 'p1_high' as const,
    checkFrequencyBucket: 'daily' as const,
    authorityScore: 90,
  },
  {
    canonicalUrl: 'https://www.spglobal.com/commodityinsights/en/market-insights/latest-news/oil',
    name: 'S&P Global Commodity Insights',
    sourceType: 'web_page' as const,
    category: 'general_market' as const,
    priorityTier: 'p1_high' as const,
    checkFrequencyBucket: 'daily' as const,
    authorityScore: 90,
  },
  {
    canonicalUrl: 'https://www.ammoniaenergy.org/articles/',
    name: 'Ammonia Energy Association',
    sourceType: 'web_page' as const,
    category: 'general_market' as const,
    priorityTier: 'p2_standard' as const,
    checkFrequencyBucket: 'weekly' as const,
    authorityScore: 85,
  },
  {
    canonicalUrl: 'https://www.zawya.com/en/business/energy',
    name: 'Zawya Energy (MENA)',
    sourceType: 'web_page' as const,
    category: 'general_market' as const,
    priorityTier: 'p1_high' as const,
    checkFrequencyBucket: 'daily' as const,
    authorityScore: 85,
  },
  {
    canonicalUrl: 'https://energycapitalandpower.com/latest-news/',
    name: 'Energy Capital & Power (Africa)',
    sourceType: 'web_page' as const,
    category: 'general_market' as const,
    priorityTier: 'p2_standard' as const,
    checkFrequencyBucket: 'daily' as const,
    authorityScore: 80,
  },
  {
    canonicalUrl: 'https://www.chemengonline.com/',
    name: 'Chemical Engineering',
    sourceType: 'web_page' as const,
    category: 'general_market' as const,
    priorityTier: 'p2_standard' as const,
    checkFrequencyBucket: 'weekly' as const,
    authorityScore: 80,
  },
  {
    canonicalUrl: 'https://www.icis.com/explore/resources/news/',
    name: 'ICIS Chemical News',
    sourceType: 'web_page' as const,
    category: 'general_market' as const,
    priorityTier: 'p2_standard' as const,
    checkFrequencyBucket: 'daily' as const,
    authorityScore: 85,
  },
  {
    canonicalUrl: 'https://oilprice.com/Latest-Energy-News/World-News/',
    name: 'OilPrice.com',
    sourceType: 'web_page' as const,
    category: 'general_market' as const,
    priorityTier: 'p2_standard' as const,
    checkFrequencyBucket: 'daily' as const,
    authorityScore: 80,
  },
  {
    canonicalUrl: 'https://www.hydrogennewsletter.com/',
    name: 'Hydrogen Newsletter',
    sourceType: 'web_page' as const,
    category: 'general_market' as const,
    priorityTier: 'p2_standard' as const,
    checkFrequencyBucket: 'weekly' as const,
    authorityScore: 80,
  },
];

function sourceIdFromUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 24);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const now = new Date();

  if (apply) {
    if (!admin.apps.length) admin.initializeApp();
    const db = getFirestore();
    console.log(`Firestore project: ${admin.app().options.projectId ?? '(auto)'}`);

    const batch = db.batch();
    for (const s of SOURCES) {
      const sourceId = sourceIdFromUrl(s.canonicalUrl);
      const ref = db.collection('sources').doc(sourceId);
      batch.set(ref, {
        sourceId,
        name: s.name,
        canonicalUrl: s.canonicalUrl,
        sourceType: s.sourceType,
        category: s.category,
        isActive: true,
        authorityScore: s.authorityScore,
        priorityTier: s.priorityTier,
        fetchStrategy: {
          fetchMethodHint: 'html',
          checkFrequencyBucket: s.checkFrequencyBucket,
          etagSupport: 'unknown',
          authRequired: false,
        },
        parserStrategy: {
          parserStrategyKey: 'html_generic',
          contentLanguageHint: 'en',
          expectedContentKind: 'web_html',
        },
        linkedEntityRefs: [],
        createdAt: now,
        updatedAt: now,
        createdBy: 'seed:market-expansion-v1',
      }, { merge: true });
      console.log(`  SET sources/${sourceId} — ${s.name}`);
    }
    await batch.commit();
    console.log(`\n${SOURCES.length} sources written to Firestore.`);
  } else {
    console.log('DRY-RUN (pass --apply to write):\n');
    for (const s of SOURCES) {
      const sourceId = sourceIdFromUrl(s.canonicalUrl);
      console.log(`  ${sourceId} — ${s.name} (${s.canonicalUrl})`);
    }
    console.log(`\n${SOURCES.length} sources would be written.`);
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
