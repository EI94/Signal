/** Minimal HTML escaping for user-controlled strings in sober templates. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  project_award: 'Project Award',
  partnership_mou: 'Partnership',
  earnings_reporting_update: 'Earnings Update',
  ma_divestment: 'M&A / Divestment',
  technology_milestone: 'Technology',
};

export function humanSignalType(raw: string): string {
  return SIGNAL_TYPE_LABELS[raw] ?? raw.replace(/_/g, ' ');
}

export function humanDate(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function humanTime(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

/** Production web app (links in emails). Override with SIGNAL_EMAIL_PRODUCT_URL for staging. */
export const PRODUCT_URL =
  process.env.SIGNAL_EMAIL_PRODUCT_URL?.trim() || 'https://www.signalfromtheworld.com';

/** Logo shown in email header (HTTPS, absolute). Prefer PNG/SVG hosted on your domain. */
function emailBrandLogoUrl(): string {
  const raw = process.env.SIGNAL_EMAIL_LOGO_URL?.trim();
  if (raw) return raw;
  return `${PRODUCT_URL.replace(/\/$/, '')}/email/signal-mark.svg`;
}

export function emailLayout(params: {
  preheader: string;
  bodyHtml: string;
  footerExtra?: string;
}): string {
  const { preheader, bodyHtml, footerExtra } = params;
  const logoUrl = emailBrandLogoUrl();
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<meta name="supported-color-schemes" content="light"/>
<title>Signal</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table,td{mso-table-lspace:0;mso-table-rspace:0}
img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}
body{margin:0;padding:0;width:100%!important;-webkit-font-smoothing:antialiased}
a{color:#1a6dd4;text-decoration:none}
a:hover{text-decoration:underline}
</style>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px 24px;">

<!-- Container -->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

<!-- Header: brand mark + wordmark (reassuring visual identity in all mail clients) -->
<tr>
<td style="background:#0f172a;padding:22px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td width="52" valign="middle" style="padding:0 16px 0 0;">
<img src="${escapeHtml(logoUrl)}" width="40" height="40" alt="Signal" style="display:block;border:0;border-radius:8px;width:40px;height:40px;"/>
</td>
<td valign="middle">
<div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.4px;line-height:1.2;">Signal</div>
<div style="font-size:12px;color:#94a3b8;letter-spacing:0.25px;margin-top:4px;">Intelligence from the world</div>
</td>
</tr>
</table>
</td>
</tr>

<!-- Body -->
<tr>
<td style="padding:0;">
${bodyHtml}
</td>
</tr>

<!-- Footer -->
<tr>
<td style="border-top:1px solid #e5e7eb;padding:24px 32px;background:#fafafa;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="font-size:12px;color:#9ca3af;line-height:1.5;">
${footerExtra ?? ''}
<a href="${PRODUCT_URL}" style="color:#6b7280;text-decoration:underline;">Open Signal</a>&nbsp;&nbsp;&middot;&nbsp;&nbsp;
<a href="${PRODUCT_URL}/settings" style="color:#6b7280;text-decoration:underline;">Manage preferences</a>
</td>
</tr>
<tr>
<td style="padding-top:12px;font-size:11px;color:#c0c0c0;line-height:1.4;">
Signal by <strong>Volta</strong>&nbsp;&middot;&nbsp;Intelligence, not noise.<br/>
You received this email because you are subscribed to Signal alerts.
</td>
</tr>
</table>
</td>
</tr>

</table>
<!-- /Container -->

</td></tr>
</table>
</body>
</html>`;
}
