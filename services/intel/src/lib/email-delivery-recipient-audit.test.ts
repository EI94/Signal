import { describe, expect, it } from 'vitest';
import { buildEmailDeliveryRecipientAudit } from './email-delivery-recipient-audit';

describe('buildEmailDeliveryRecipientAudit', () => {
  it('counts recipients, unique domains, and masks locals', () => {
    const r = buildEmailDeliveryRecipientAudit(['alice@acme.com', 'bob@acme.com', 'c@other.org']);
    expect(r.recipientCount).toBe(3);
    expect(r.recipientDomains).toEqual(['acme.com', 'other.org']);
    expect(r.recipientsMasked).toEqual(['a***@acme.com', 'b***@acme.com', 'c***@other.org']);
  });

  it('does not include raw emails', () => {
    const r = buildEmailDeliveryRecipientAudit(['x@y.z']);
    expect(JSON.stringify(r)).not.toContain('x@y.z');
    expect(r.recipientsMasked[0]).toMatch(/^\S+\*\*\*@y\.z$/);
  });
});
