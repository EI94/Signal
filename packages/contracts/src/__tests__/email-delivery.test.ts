import { describe, expect, it } from 'vitest';
import {
  SendAlertEmailRequestSchema,
  SendBriefEmailRequestSchema,
  SendEmailDeliveryResponseSchema,
} from '../email-delivery';

describe('email-delivery schemas', () => {
  it('parses send brief request', () => {
    const r = SendBriefEmailRequestSchema.parse({
      briefId: 'b1',
      to: ['a@b.com'],
    });
    expect(r.briefId).toBe('b1');
  });

  it('parses send alert request', () => {
    const r = SendAlertEmailRequestSchema.parse({
      alertRuleId: 'r1',
      signalId: 's1',
      to: ['x@y.com'],
      evaluationReference: 'eval:1',
    });
    expect(r.evaluationReference).toBe('eval:1');
  });

  it('parses delivery response', () => {
    expect(
      SendEmailDeliveryResponseSchema.parse({
        deliveryId: 'd1',
        status: 'sent',
        providerMessageId: 'pm',
      }).status,
    ).toBe('sent');
  });
});
