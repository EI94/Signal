import { z } from 'zod';

/** POST `/internal/send-brief-email` body. */
export const SendBriefEmailRequestSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  briefId: z.string().min(1),
  /** Max 20 — keep blast radius small; Resend allows up to 50. */
  to: z.array(z.string().email()).min(1).max(20),
});

export type SendBriefEmailRequest = z.infer<typeof SendBriefEmailRequestSchema>;

/** POST `/internal/send-alert-email` body. */
export const SendAlertEmailRequestSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  alertRuleId: z.string().min(1),
  signalId: z.string().min(1),
  to: z.array(z.string().email()).min(1).max(20),
  /** Optional trace id (e.g. BigQuery `evaluation_id` or client correlation). */
  evaluationReference: z.string().min(1).max(512).optional(),
});

export type SendAlertEmailRequest = z.infer<typeof SendAlertEmailRequestSchema>;

/** Unified response for internal send routes (brief + alert). */
export const SendEmailDeliveryResponseSchema = z.object({
  deliveryId: z.string().min(1),
  status: z.enum(['sent', 'failed', 'skipped']),
  providerMessageId: z.string().optional(),
  errorMessage: z.string().optional(),
  skippedReason: z.string().optional(),
});

export type SendEmailDeliveryResponse = z.infer<typeof SendEmailDeliveryResponseSchema>;
