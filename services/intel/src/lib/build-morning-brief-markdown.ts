import type { LatestSignalDocument, MorningBriefType } from '@signal/contracts';
import { BRIEF_SELECTION, filterByEntityType } from './select-brief-signals';

function roundScore(s: number): number {
  const r = Math.round(Number(s));
  if (Number.isNaN(r)) return 0;
  return Math.min(100, Math.max(0, r));
}

function lineForSignal(s: LatestSignalDocument): string {
  const score = roundScore(s.score);
  const sum = s.shortSummary ? ` — ${s.shortSummary}` : '';
  return `- **${s.title}** (score ${score}, ${s.signalType})${sum}`;
}

export function buildMorningBriefMarkdown(params: {
  briefType: MorningBriefType;
  workspaceId: string;
  periodLabel: string;
  periodStartIso: string;
  periodEndIso: string;
  selected: LatestSignalDocument[];
  /** Optional block inserted after title (e.g. enrichment). */
  executiveSummaryBlock?: string | undefined;
}): string {
  const {
    briefType,
    workspaceId,
    periodLabel,
    periodStartIso,
    periodEndIso,
    selected,
    executiveSummaryBlock,
  } = params;
  const maxSec = BRIEF_SELECTION[briefType].maxPerSection;

  const title =
    briefType === 'daily_workspace'
      ? `Daily workspace brief — ${periodLabel}`
      : `Board digest — ${periodLabel}`;

  const lines: string[] = [
    `# ${title}`,
    '',
    `- Workspace: \`${workspaceId}\``,
    `- Period (UTC): ${periodStartIso} → ${periodEndIso}`,
    `- Variant: \`${briefType}\``,
    '',
  ];

  if (executiveSummaryBlock !== undefined && executiveSummaryBlock.trim() !== '') {
    lines.push('## Executive summary', '', executiveSummaryBlock.trim(), '');
  }

  lines.push('## Top signals', '');
  if (selected.length === 0) {
    lines.push('_No signals matched selection rules for this window._', '');
  } else {
    for (const s of selected.slice(0, maxSec)) {
      lines.push(lineForSignal(s));
    }
    lines.push('');
  }

  const competitor = filterByEntityType(selected, 'competitor', maxSec);
  lines.push('## Competitor-linked', '');
  if (competitor.length === 0) {
    lines.push('_No competitor-linked signals in the selected set._', '');
  } else {
    for (const s of competitor) {
      lines.push(lineForSignal(s));
    }
    lines.push('');
  }

  const client = filterByEntityType(selected, 'client', maxSec);
  lines.push('## Client-linked', '');
  if (client.length === 0) {
    lines.push('_No client-linked signals in the selected set._', '');
  } else {
    for (const s of client) {
      lines.push(lineForSignal(s));
    }
    lines.push('');
  }

  const geo = filterByEntityType(selected, 'geography', maxSec);
  lines.push('## Markets & regions (geography-linked)', '');
  if (geo.length === 0) {
    lines.push('_No geography-linked signals in the selected set._', '');
  } else {
    for (const s of geo) {
      lines.push(lineForSignal(s));
    }
    lines.push('');
  }

  lines.push(
    '---',
    '',
    '_Generated deterministically from `signalsLatest`. Optional LLM enrichment only affects the executive summary when enabled._',
  );

  return lines.join('\n');
}
