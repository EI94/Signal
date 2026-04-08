import { describe, expect, it } from 'vitest';
import { EmailDeliveryDocumentSchema } from '../firestore-operational';

describe('EmailDeliveryDocumentSchema', () => {
  it('accepts minimized audit fields', () => {
    const now = new Date('2026-04-05T12:00:00.000Z');
    const r = EmailDeliveryDocumentSchema.safeParse({
      kind: 'brief',
      status: 'sent',
      provider: 'resend',
      subject: 'Hello',
      recipientCount: 2,
      recipientDomains: ['acme.com', 'other.org'],
      recipientsMasked: ['a***@acme.com', 'b***@other.org'],
      attemptedAt: now,
      sentAt: now,
      providerMessageId: 'pm_1',
      briefId: 'b1',
      createdAt: now,
      updatedAt: now,
    });
    expect(r.success).toBe(true);
  });

  it('rejects legacy full recipients array', () => {
    const now = new Date();
    const r = EmailDeliveryDocumentSchema.safeParse({
      kind: 'brief',
      status: 'sent',
      provider: 'resend',
      subject: 'Hello',
      recipients: ['a@b.com'],
      attemptedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    expect(r.success).toBe(false);
  });
});
