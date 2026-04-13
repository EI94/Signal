import type { LatestSignalDocument } from '@signal/contracts';
import {
  formatEntityContextLine,
  pickEmailHeadline,
  pickSecondaryBlurb,
} from './email-signal-presentation';
import { emailLayout, escapeHtml, humanSignalType, PRODUCT_URL } from './render-email-html';
import { filterByEntityType } from './select-brief-signals';

export function buildBriefEmailSubject(params: { title: string; dateLabel: string }): string {
  return `Your daily intelligence brief — ${params.dateLabel}`;
}

/** How many signals per section in the email. */
const EMAIL_MAX_PER_SECTION = 6;

export interface BriefEmailSignal {
  signalId: string;
  title: string;
  /** Newspaper-style lead (from shortSummary or cleaned title). */
  headline: string;
  /** Entity names for the meta line. */
  contextLine?: string;
  /** Extra detail when headline is first sentence only, or full summary when headline came from title. */
  secondaryBlurb?: string;
  signalType: string;
  score: number;
  shortSummary?: string | null;
  sourceUrl?: string;
  sourceLabel?: string;
}

function signalFromDoc(s: LatestSignalDocument): BriefEmailSignal {
  const headline = pickEmailHeadline({
    title: s.title,
    signalType: s.signalType,
    shortSummary: s.shortSummary,
  });
  const contextLine = formatEntityContextLine(s.entityRefs) ?? undefined;
  const secondaryBlurb = pickSecondaryBlurb(s.shortSummary, headline) ?? undefined;

  return {
    signalId: s.signalId,
    title: s.title,
    headline,
    contextLine,
    secondaryBlurb,
    signalType: s.signalType,
    score: Math.round(s.score),
    shortSummary: s.shortSummary,
    sourceUrl: s.provenance?.sourceUrl,
    sourceLabel: s.provenance?.sourceLabel,
  };
}

function renderSignalRow(s: BriefEmailSignal): string {
  const typeLabel = humanSignalType(s.signalType);

  const contextHtml = s.contextLine
    ? `<span style="display:block;margin-top:6px;font-size:13px;color:#64748b;line-height:1.45;"><span style="color:#94a3b8;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:0.4px;">Focus · </span>${escapeHtml(s.contextLine)}</span>`
    : '';

  const secondaryHtml = s.secondaryBlurb
    ? `<span style="display:block;margin-top:10px;font-size:14px;color:#4b5563;line-height:1.5;">${escapeHtml(s.secondaryBlurb)}</span>`
    : '';

  const sourceLink = s.sourceUrl?.startsWith('http')
    ? `<a href="${escapeHtml(s.sourceUrl)}" style="color:#6b7280;font-size:12px;text-decoration:underline;line-height:1.45;">${escapeHtml(s.sourceLabel ?? 'Source')}</a>`
    : '';

  const signalLink = `<a href="${PRODUCT_URL}?signal=${encodeURIComponent(s.signalId)}" style="color:#1a6dd4;font-size:12px;text-decoration:none;font-weight:500;line-height:1.45;">Read on Signal&nbsp;→</a>`;

  const linksBlock = sourceLink
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
<tr><td style="padding-bottom:8px;">${sourceLink}</td></tr>
<tr><td>${signalLink}</td></tr>
</table>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
<tr><td>${signalLink}</td></tr>
</table>`;

  return `<tr>
<td style="padding:16px 0;border-bottom:1px solid #f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td>
<span style="display:inline-block;font-size:11px;font-weight:600;color:#475569;background:#f1f5f9;padding:2px 8px;border-radius:3px;letter-spacing:0.3px;text-transform:uppercase;">${escapeHtml(typeLabel)}</span>
</td>
<td align="right">
<span style="font-size:12px;font-weight:600;color:${s.score >= 70 ? '#b91c1c' : s.score >= 50 ? '#92400e' : '#6b7280'};">${s.score}</span>
</td>
</tr>
</table>
<span style="display:block;margin-top:8px;font-size:16px;font-weight:700;color:#111827;line-height:1.4;word-wrap:break-word;overflow-wrap:break-word;">${escapeHtml(s.headline)}</span>
${contextHtml}
${secondaryHtml}
${linksBlock}
</td>
</tr>`;
}

function renderSection(params: {
  title: string;
  icon: string;
  signals: BriefEmailSignal[];
}): string {
  const { title, icon, signals } = params;
  if (signals.length === 0) {
    return '';
  }

  const rows = signals.map(renderSignalRow).join('');

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
<tr>
<td class="email-h-pad" style="padding:20px 32px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="font-size:13px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.6px;padding-bottom:8px;border-bottom:2px solid #0f172a;">
${icon}&nbsp;&nbsp;${escapeHtml(title)}
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td class="email-h-pad" style="padding:0 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${rows}
</table>
</td>
</tr>
</table>`;
}

export function buildBriefEmailHtml(params: {
  title: string;
  dateLabel: string;
  periodStartIso: string;
  periodEndIso: string;
  signals: LatestSignalDocument[];
  executiveSummary?: string;
}): string {
  const { title, dateLabel, signals, executiveSummary } = params;

  const allBriefSignals = signals.map(signalFromDoc);
  const topSignals = allBriefSignals.slice(0, EMAIL_MAX_PER_SECTION);
  const competitorSignals = filterByEntityType(signals, 'competitor', EMAIL_MAX_PER_SECTION).map(
    signalFromDoc,
  );
  const clientSignals = filterByEntityType(signals, 'client', EMAIL_MAX_PER_SECTION).map(
    signalFromDoc,
  );
  const geoSignals = filterByEntityType(signals, 'geography', EMAIL_MAX_PER_SECTION).map(
    signalFromDoc,
  );

  const heroHtml = `
<tr>
<td class="email-h-pad" style="padding:28px 32px 20px;">
<p style="margin:0;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">${escapeHtml(title)}</p>
<p style="margin:6px 0 0;font-size:13px;color:#64748b;">${escapeHtml(dateLabel)}&nbsp;&nbsp;&middot;&nbsp;&nbsp;${signals.length} signal${signals.length !== 1 ? 's' : ''} detected</p>
</td>
</tr>`;

  let execHtml = '';
  if (executiveSummary?.trim()) {
    execHtml = `
<tr>
<td class="email-h-pad" style="padding:0 32px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border-left:4px solid #0f172a;">
<tr>
<td style="padding:16px 20px;">
<p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Executive summary</p>
<p style="margin:0;font-size:14px;color:#1e293b;line-height:1.55;">${escapeHtml(executiveSummary.trim())}</p>
</td>
</tr>
</table>
</td>
</tr>`;
  }

  const noSignalsHtml =
    signals.length === 0
      ? `<tr><td class="email-h-pad" style="padding:32px;text-align:center;color:#94a3b8;font-size:14px;">No signals matched your criteria for this period.</td></tr>`
      : '';

  const sections = [
    renderSection({ title: 'Top signals', icon: '◆', signals: topSignals }),
    renderSection({ title: 'Competitor intelligence', icon: '◈', signals: competitorSignals }),
    renderSection({ title: 'Client developments', icon: '◇', signals: clientSignals }),
    renderSection({ title: 'Markets & regions', icon: '◉', signals: geoSignals }),
  ]
    .filter(Boolean)
    .join('');

  const ctaHtml =
    signals.length > 0
      ? `
<tr>
<td class="email-h-pad" style="padding:20px 32px 28px;" align="center">
<a href="${PRODUCT_URL}" class="email-cta-btn" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;letter-spacing:0.2px;line-height:1.35;">Open Signal dashboard</a>
</td>
</tr>`
      : '';

  const bodyHtml = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${heroHtml}
${execHtml}
${noSignalsHtml}
</table>
${sections}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${ctaHtml}
</table>`;

  const first = signals[0];
  const preheaderLead = first
    ? pickEmailHeadline({
        title: first.title,
        signalType: first.signalType,
        shortSummary: first.shortSummary,
      })
    : 'your daily brief';

  const preheader =
    signals.length > 0
      ? `${signals.length} signals — ${preheaderLead.slice(0, 100)}${preheaderLead.length > 100 ? '…' : ''}`
      : 'Your daily intelligence brief';

  return emailLayout({ preheader, bodyHtml });
}

export function buildBriefEmailPlainText(params: {
  title: string;
  dateLabel: string;
  signals: LatestSignalDocument[];
  executiveSummary?: string;
}): string {
  const { title, dateLabel, signals, executiveSummary } = params;
  const lines: string[] = [title, dateLabel, ''];

  if (executiveSummary?.trim()) {
    lines.push('EXECUTIVE SUMMARY', executiveSummary.trim(), '');
  }

  if (signals.length === 0) {
    lines.push('No signals matched your criteria for this period.', '');
  } else {
    lines.push('TOP SIGNALS', '');
    for (const s of signals.slice(0, EMAIL_MAX_PER_SECTION)) {
      const headline = pickEmailHeadline({
        title: s.title,
        signalType: s.signalType,
        shortSummary: s.shortSummary,
      });
      const ctx = formatEntityContextLine(s.entityRefs);
      const secondary = pickSecondaryBlurb(s.shortSummary, headline);
      const type = humanSignalType(s.signalType);
      lines.push(`• ${headline}`);
      lines.push(`  [${type}] · score ${Math.round(s.score)}`);
      if (ctx) lines.push(`  Focus: ${ctx}`);
      if (secondary) lines.push(`  ${secondary}`);
      if (s.provenance?.sourceUrl) lines.push(`  Source: ${s.provenance.sourceUrl}`);
      lines.push(`  ${PRODUCT_URL}?signal=${encodeURIComponent(s.signalId)}`);
      lines.push('');
    }
  }

  lines.push('---', `Open Signal: ${PRODUCT_URL}`, `Manage preferences: ${PRODUCT_URL}/settings`);
  return lines.join('\n');
}
