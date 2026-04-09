import type { IntelRuntimeConfig } from '@signal/config';
import { getFirestoreDb, initFirebaseAdmin } from './firebase-admin';
import { enrichSignalWithGemini } from './gemini-enrichment';
import { downloadObjectBytes } from './download-object';
import { parseGcsUri } from './gcs-uri';
import { querySourceContentMetadata } from './query-source-content-metadata';

export type EnrichSignalResult = {
  signalId: string;
  enrichedSummary: string | null;
  countryCodes: string[];
  cityName: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  cached: boolean;
};

export async function enrichSignalOnDemand(
  params: { workspaceId: string; signalId: string },
  config: IntelRuntimeConfig,
): Promise<EnrichSignalResult> {
  initFirebaseAdmin(config.firebaseProjectId);
  const db = getFirestoreDb();

  const signalRef = db
    .collection('workspaces')
    .doc(params.workspaceId)
    .collection('signalsLatest')
    .doc(params.signalId);

  const snap = await signalRef.get();
  if (!snap.exists) throw new Error('signal_not_found');

  const data = snap.data() as Record<string, unknown>;

  if (data.enrichedSummary && typeof data.enrichedSummary === 'string') {
    return {
      signalId: params.signalId,
      enrichedSummary: data.enrichedSummary as string,
      countryCodes: Array.isArray(data.enrichedCountryCodes) ? data.enrichedCountryCodes as string[] : [],
      cityName: typeof data.enrichedCityName === 'string' ? data.enrichedCityName : null,
      sourceUrl: typeof data.provenance === 'object' && data.provenance ? (data.provenance as Record<string, unknown>).sourceUrl as string ?? null : null,
      sourceLabel: typeof data.provenance === 'object' && data.provenance ? (data.provenance as Record<string, unknown>).sourceLabel as string ?? null : null,
      cached: true,
    };
  }

  if (!config.geminiEnabled || !config.geminiApiKey) {
    return {
      signalId: params.signalId,
      enrichedSummary: null,
      countryCodes: [],
      cityName: null,
      sourceUrl: typeof data.provenance === 'object' && data.provenance ? (data.provenance as Record<string, unknown>).sourceUrl as string ?? null : null,
      sourceLabel: typeof data.provenance === 'object' && data.provenance ? (data.provenance as Record<string, unknown>).sourceLabel as string ?? null : null,
      cached: false,
    };
  }

  let sourceText: string | null = null;
  const contentRef = typeof data.provenance === 'object' && data.provenance
    ? (data.provenance as Record<string, unknown>).contentRef as string | undefined
    : undefined;

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
        sourceText = buf.toString('utf8');
      }
    } catch (err) {
      console.warn('[enrich-on-demand] failed to load source text:', err);
    }
  }

  const title = typeof data.title === 'string' ? data.title : '';
  const signalType = typeof data.signalType === 'string' ? data.signalType : '';
  const entityRefs = Array.isArray(data.entityRefs) ? data.entityRefs : [];

  const enrichment = await enrichSignalWithGemini(config, {
    title,
    rawText: sourceText ?? title,
    entityRefs,
    signalType,
  });

  const provenance = typeof data.provenance === 'object' && data.provenance ? data.provenance as Record<string, unknown> : {};

  if (enrichment) {
    await signalRef.update({
      enrichedSummary: enrichment.summary,
      enrichedCountryCodes: enrichment.countryCodes,
      enrichedCityName: enrichment.cityName,
      enrichedAt: new Date(),
    });
  }

  return {
    signalId: params.signalId,
    enrichedSummary: enrichment?.summary ?? null,
    countryCodes: enrichment?.countryCodes ?? [],
    cityName: enrichment?.cityName ?? null,
    sourceUrl: provenance.sourceUrl as string ?? null,
    sourceLabel: provenance.sourceLabel as string ?? null,
    cached: false,
  };
}
