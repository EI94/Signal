import type { EntityRef } from '@signal/contracts';
import {
  formatEntityContextLine,
  pickEmailHeadline,
  pickSecondaryBlurb,
} from './email-signal-presentation';
import {
  emailLayout,
  escapeHtml,
  humanDate,
  humanSignalType,
  humanTime,
  PRODUCT_URL,
} from './render-email-html';

export function buildAlertEmailSubject(params: {
  signalTitle: string;
  signalType?: string;
  shortSummary?: string | null;
}): string {
  const signalType = params.signalType ?? 'unknown';
  const headline = pickEmailHeadline({
    title: params.signalTitle,
    signalType,
    shortSummary: params.shortSummary,
  });
  const maxLen = 68;
  const line = headline.length > maxLen ? `${headline.slice(0, maxLen - 1)}…` : headline;
  return `Signal — ${line}`;
}

export function buildAlertEmailHtml(params: {
  signalId: string;
  signalTitle: string;
  signalType: string;
  score: number;
  detectedAtIso: string;
  shortSummary?: string | undefined;
  sourceUrl?: string | undefined;
  sourceLabel?: string | undefined;
  matchReason?: string | undefined;
  entityRefs?: readonly EntityRef[];
}): string {
  const {
    signalId,
    signalTitle,
    signalType,
    score,
    detectedAtIso,
    shortSummary,
    sourceUrl,
    matchReason,
    entityRefs,
  } = params;

  const headline = pickEmailHeadline({
    title: signalTitle,
    signalType,
    shortSummary: shortSummary ?? null,
  });
  const contextLine = formatEntityContextLine(entityRefs);
  const secondaryBlurb = pickSecondaryBlurb(shortSummary ?? null, headline);

  const typeLabel = humanSignalType(signalType);
  const dateStr = humanDate(detectedAtIso);
  const timeStr = humanTime(detectedAtIso);

  const scoreBg = score >= 70 ? '#fef2f2' : score >= 50 ? '#fffbeb' : '#f8fafc';
  const scoreColor = score >= 70 ? '#b91c1c' : score >= 50 ? '#92400e' : '#475569';
  const scoreBorder = score >= 70 ? '#fecaca' : score >= 50 ? '#fde68a' : '#e2e8f0';

  const contextHtml = contextLine
    ? `<tr>
<td style="padding:0 32px 12px;">
<p style="margin:0;font-size:13px;color:#64748b;line-height:1.45;"><span style="color:#94a3b8;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:0.4px;">Focus · </span>${escapeHtml(contextLine)}</p>
</td>
</tr>`
    : '';

  const secondaryBlock = secondaryBlurb
    ? `<tr>
<td style="padding:0 32px 20px;">
<p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">${escapeHtml(secondaryBlurb)}</p>
</td>
</tr>`
    : '';

  const matchReasonBlock = matchReason?.trim()
    ? `<tr>
<td style="padding:0 32px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:6px;">
<tr>
<td style="padding:10px 16px;font-size:12px;color:#64748b;line-height:1.4;">
Matched by: <strong style="color:#334155;">${escapeHtml(matchReason.trim())}</strong>
</td>
</tr>
</table>
</td>
</tr>`
    : '';

  const sourceBlock = sourceUrl?.startsWith('http')
    ? `<td style="padding-right:20px;">
<a href="${escapeHtml(sourceUrl)}" style="display:inline-block;color:#475569;font-size:13px;font-weight:500;text-decoration:underline;">Read original source&nbsp;↗</a>
</td>`
    : '';

  const bodyHtml = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">

<!-- Alert badge -->
<tr>
<td style="padding:28px 32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr>
<td style="background:${scoreBg};border:1px solid ${scoreBorder};border-radius:6px;padding:6px 12px;">
<span style="font-size:12px;font-weight:700;color:${scoreColor};letter-spacing:0.3px;">IMPORTANCE&nbsp;&nbsp;${score}</span>
</td>
<td style="padding-left:12px;">
<span style="font-size:12px;color:#94a3b8;">${escapeHtml(dateStr)}&nbsp;&nbsp;${escapeHtml(timeStr)}</span>
</td>
</tr>
</table>
</td>
</tr>

<!-- Category chip (no duplicate of headline) -->
<tr>
<td style="padding:0 32px 8px;">
<span style="font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(typeLabel)}</span>
</td>
</tr>
<tr>
<td style="padding:0 32px 8px;">
<p style="margin:0;font-size:20px;font-weight:700;color:#0f172a;line-height:1.35;">${escapeHtml(headline)}</p>
</td>
</tr>

${contextHtml}

${secondaryBlock}

<!-- Match reason -->
${matchReasonBlock}

<!-- Divider -->
<tr>
<td style="padding:0 32px;">
<div style="border-top:1px solid #e5e7eb;"></div>
</td>
</tr>

<!-- CTAs -->
<tr>
<td style="padding:20px 32px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr>
<td>
<a href="${PRODUCT_URL}?signal=${encodeURIComponent(signalId)}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:13px;font-weight:600;padding:10px 24px;border-radius:6px;text-decoration:none;letter-spacing:0.2px;">View in Signal</a>
</td>
${sourceBlock}
</tr>
</table>
</td>
</tr>

</table>`;

  const preheaderBase =
    headline.trim() ||
    (shortSummary?.trim() ? shortSummary.trim().slice(0, 120) : `New signal: ${signalTitle}`);
  const preheader = preheaderBase.length > 120 ? `${preheaderBase.slice(0, 119)}…` : preheaderBase;

  return emailLayout({ preheader, bodyHtml });
}

export function buildAlertEmailPlainText(params: {
  signalId: string;
  signalTitle: string;
  signalType: string;
  score: number;
  detectedAtIso: string;
  shortSummary?: string | undefined;
  sourceUrl?: string | undefined;
  sourceLabel?: string | undefined;
  matchReason?: string | undefined;
  entityRefs?: readonly EntityRef[];
}): string {
  const headline = pickEmailHeadline({
    title: params.signalTitle,
    signalType: params.signalType,
    shortSummary: params.shortSummary ?? null,
  });
  const ctx = formatEntityContextLine(params.entityRefs);
  const secondary = pickSecondaryBlurb(params.shortSummary ?? null, headline);

  const lines = [
    headline,
    `${humanSignalType(params.signalType)} — Importance ${params.score}`,
    `${humanDate(params.detectedAtIso)}`,
    '',
  ];

  if (ctx) {
    lines.push(`Focus: ${ctx}`, '');
  }

  if (secondary) {
    lines.push(secondary, '');
  }

  if (params.matchReason) {
    lines.push(`Matched by: ${params.matchReason}`, '');
  }

  lines.push(`View in Signal: ${PRODUCT_URL}?signal=${encodeURIComponent(params.signalId)}`);

  if (params.sourceUrl) {
    lines.push(`Original source: ${params.sourceUrl}`);
  }

  lines.push(
    '',
    '---',
    `Open Signal: ${PRODUCT_URL}`,
    `Manage preferences: ${PRODUCT_URL}/settings`,
  );
  return lines.join('\n');
}
