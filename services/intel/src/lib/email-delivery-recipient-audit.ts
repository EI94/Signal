/**
 * Minimized recipient fields for Firestore `emailDeliveries` audit — no full address list.
 */
export type EmailDeliveryRecipientAudit = {
  readonly recipientCount: number;
  readonly recipientDomains: string[];
  readonly recipientsMasked: string[];
};

const RECIPIENTS_MASKED_MAX = 32;

function domainFromEmail(email: string): string | null {
  const i = email.lastIndexOf('@');
  if (i <= 0 || i === email.length - 1) return null;
  return email.slice(i + 1).toLowerCase();
}

function maskOneRecipient(email: string): string {
  const i = email.lastIndexOf('@');
  if (i <= 0) return '***';
  const local = email.slice(0, i);
  const domain = email.slice(i + 1).toLowerCase();
  const first = local.charAt(0) || '?';
  return `${first}***@${domain}`;
}

/**
 * Derives audit-only recipient metadata from the same `to[]` list passed to Resend.
 */
export function buildEmailDeliveryRecipientAudit(
  to: readonly string[],
): EmailDeliveryRecipientAudit {
  const recipientCount = to.length;
  const domainSet = new Set<string>();
  for (const e of to) {
    const d = domainFromEmail(e.trim());
    if (d) domainSet.add(d);
  }
  const recipientDomains = [...domainSet].sort();
  const recipientsMasked = to
    .map((e) => maskOneRecipient(e.trim()))
    .slice(0, RECIPIENTS_MASKED_MAX);
  return { recipientCount, recipientDomains, recipientsMasked };
}
