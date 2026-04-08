import { randomUUID } from 'node:crypto';
import type { IntelRuntimeConfig } from '@signal/config';
import {
  type BriefDocument,
  type BriefRunRow,
  buildGsUri,
  type GenerateMorningBriefRequest,
  type LatestSignalDocument,
  type MorningBriefGenerationResult,
  MorningBriefGenerationResultSchema,
  type SummarizeDeltaToolInput,
} from '@signal/contracts';
import { buildBriefMarkdownObjectKey } from './brief-gcs-path';
import { buildMorningBriefMarkdown } from './build-morning-brief-markdown';
import { getFirestoreDb } from './firebase-admin';
import { loadLatestSignalsWindowForBrief } from './load-latest-signals-window';
import { callPerplexitySummarizeDelta } from './perplexity-adapter';
import { writeBriefDocumentToFirestore } from './persist-brief-metadata';
import { insertBriefRunRow } from './persist-brief-run';
import { selectSignalsForBrief } from './select-brief-signals';
import { uploadBriefMarkdownArtifact } from './upload-brief-markdown';

export function resolveUtcReportingPeriod(params: { periodDate: string | undefined; now: Date }): {
  periodStart: Date;
  periodEnd: Date;
  periodDateStr: string;
} {
  const { now } = params;
  const periodDateStr =
    params.periodDate ??
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const parts = periodDateStr.split('-');
  if (parts.length !== 3) {
    throw new Error(`periodDate must be YYYY-MM-DD, got: ${periodDateStr}`);
  }
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const d = Number(parts[2]);
  const periodStart = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
  return { periodStart, periodEnd, periodDateStr };
}

export function formatExecutiveBlockFromSummarizeDelta(output: {
  conciseSummary: string;
  keyPoints: string[];
}): string {
  const pts = output.keyPoints.map((k) => `- ${k}`).join('\n');
  return [output.conciseSummary, '', pts].join('\n');
}

/** Bounded excerpt of real signal lines for optional `summarize_delta` (deterministic input). */
export function buildSummarizeDeltaInputForExecutiveBlock(params: {
  workspaceId: string;
  periodDateStr: string;
  briefType: string;
  signals: LatestSignalDocument[];
  maxChars: number;
}): SummarizeDeltaToolInput {
  const lines: string[] = [];
  for (const s of params.signals) {
    const line = `- ${s.title}${s.shortSummary ? ` — ${s.shortSummary}` : ''} (score ${Math.round(s.score)}, ${s.signalType})`;
    lines.push(line);
  }
  let text = lines.join('\n');
  if (text.length > params.maxChars) {
    text = text.slice(0, params.maxChars);
  }
  return {
    title: `Morning brief executive view — ${params.workspaceId} — ${params.briefType} — ${params.periodDateStr}`,
    shortSummary: text.length > 0 ? text : '(no signals in selection)',
    signalType: params.briefType,
    sourceType: 'morning_brief',
  };
}

export type BriefPerplexityEnricher = (
  input: SummarizeDeltaToolInput,
) => ReturnType<typeof callPerplexitySummarizeDelta>;

export type GenerateMorningBriefDeps = {
  loadSignals: (workspaceId: string) => Promise<LatestSignalDocument[]>;
  uploadMarkdown: (args: { objectKey: string; body: Buffer }) => Promise<void>;
  writeBriefDoc: (args: {
    workspaceId: string;
    briefId: string;
    doc: BriefDocument;
  }) => Promise<void>;
  insertBriefRun: (row: BriefRunRow) => Promise<void>;
  /** Optional; when set, used for executive block when config allows enrichment. */
  enrichExecutive?: BriefPerplexityEnricher;
  randomId?: () => string;
  now?: () => Date;
};

export function createDefaultGenerateMorningBriefDeps(
  config: IntelRuntimeConfig,
): GenerateMorningBriefDeps {
  return {
    loadSignals: (workspaceId) => loadLatestSignalsWindowForBrief(getFirestoreDb(), workspaceId),
    uploadMarkdown: ({ objectKey, body }) =>
      uploadBriefMarkdownArtifact({
        projectId: config.firebaseProjectId,
        bucketName: config.gcsRawBucketName,
        objectKey,
        body,
      }),
    writeBriefDoc: ({ workspaceId, briefId, doc }) =>
      writeBriefDocumentToFirestore({ db: getFirestoreDb(), workspaceId, briefId, doc }),
    insertBriefRun: (row) =>
      insertBriefRunRow({
        projectId: config.firebaseProjectId,
        datasetId: config.bigQueryDatasetId,
        tableId: config.bigQueryBriefRunsTableId,
        row,
      }),
    enrichExecutive: (input) => callPerplexitySummarizeDelta(config, input),
  };
}

export async function generateMorningBrief(
  request: GenerateMorningBriefRequest & { workspaceId: string },
  config: IntelRuntimeConfig,
  deps: GenerateMorningBriefDeps,
): Promise<MorningBriefGenerationResult> {
  const nowFn = deps.now ?? (() => new Date());
  const now = nowFn();
  const idFn = deps.randomId ?? randomUUID;
  const { workspaceId } = request;

  const { periodStart, periodEnd, periodDateStr } = resolveUtcReportingPeriod({
    periodDate: request.periodDate,
    now,
  });

  const allSignals = await deps.loadSignals(workspaceId);
  const selected = selectSignalsForBrief({
    signals: allSignals,
    briefType: request.briefType,
    periodStart,
    periodEnd,
    lookbackHours: config.briefLookbackHours,
    now,
  });

  let executiveSummaryBlock: string | undefined;
  let modelAssisted = false;

  const enrichmentAllowed =
    config.briefMaxEnrichmentCalls > 0 &&
    config.briefEnrichmentEnabled &&
    config.perplexityEnabled &&
    config.perplexityApiKey !== null &&
    deps.enrichExecutive !== undefined;

  if (enrichmentAllowed && selected.length > 0 && deps.enrichExecutive) {
    const input = buildSummarizeDeltaInputForExecutiveBlock({
      workspaceId,
      periodDateStr,
      briefType: request.briefType,
      signals: selected.slice(0, 12),
      maxChars: 24_000,
    });
    const enrich = deps.enrichExecutive;
    const pr = await enrich(input);
    if (pr.ok) {
      executiveSummaryBlock = formatExecutiveBlockFromSummarizeDelta(pr.output);
      modelAssisted = true;
    }
  }

  const markdown = buildMorningBriefMarkdown({
    briefType: request.briefType,
    workspaceId,
    periodLabel: periodDateStr,
    periodStartIso: periodStart.toISOString(),
    periodEndIso: periodEnd.toISOString(),
    selected,
    executiveSummaryBlock,
  });

  const briefId = idFn();
  const objectKey = buildBriefMarkdownObjectKey({ workspaceId, periodDateStr, briefId });
  const body = Buffer.from(markdown, 'utf8');
  await deps.uploadMarkdown({ objectKey, body });

  const summaryRef = buildGsUri(config.gcsRawBucketName, objectKey);
  const markdownChars = markdown.length;

  const title =
    request.briefType === 'daily_workspace'
      ? `Daily workspace — ${periodDateStr}`
      : `Board digest — ${periodDateStr}`;

  const createdAt = nowFn();
  const briefDoc: BriefDocument = {
    briefType: request.briefType,
    title,
    periodStart,
    periodEnd,
    status: 'ready',
    summaryRef,
    createdAt,
    updatedAt: createdAt,
  };

  await deps.writeBriefDoc({ workspaceId, briefId, doc: briefDoc });

  const runRow: BriefRunRow = {
    brief_run_id: briefId,
    workspace_id: workspaceId,
    brief_type: request.briefType,
    period_start: periodStart,
    period_end: periodEnd,
    status: 'completed',
    source_signal_ids: selected.map((s) => s.signalId),
    generated_at: createdAt,
    model_assisted: modelAssisted,
    created_at: createdAt,
  };

  await deps.insertBriefRun(runRow);

  const result: MorningBriefGenerationResult = {
    briefId,
    briefType: request.briefType,
    workspaceId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    summaryRef,
    markdownChars,
    sourceSignalIds: selected.map((s) => s.signalId),
    modelAssisted,
  };

  return MorningBriefGenerationResultSchema.parse(result);
}
