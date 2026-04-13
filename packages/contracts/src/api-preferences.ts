import { z } from 'zod';
import { EntityRefSchema } from './firestore-operational';
import { normalizeMarketIndexTagIds } from './market-index-tags';

export const NotificationPreferencesSchema = z.object({
  emailAlerts: z.boolean(),
  emailBriefs: z.boolean(),
});

export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

export const DigestPreferencesSchema = z.object({
  enabled: z.boolean(),
  deliveryTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  timezone: z.string().min(1).optional(),
});

export type DigestPreferences = z.infer<typeof DigestPreferencesSchema>;

export const ChannelPreferencesSchema = z.object({
  email: z.boolean(),
  whatsapp: z.boolean(),
});

export type ChannelPreferences = z.infer<typeof ChannelPreferencesSchema>;

export const CadenceModeSchema = z.enum(['immediate', 'digest', 'both']);
export type CadenceMode = z.infer<typeof CadenceModeSchema>;

/** Netflix-style macro areas (multi-select). Mapped to ISO-3166 alpha-2 sets in the alert evaluator. */
export const MacroRegionCodeSchema = z.enum([
  'EUROPE',
  'MIDDLE_EAST_AFRICA',
  'AMERICAS',
  'ASIA_PACIFIC',
  'OCEANIA',
]);

export type MacroRegionCode = z.infer<typeof MacroRegionCodeSchema>;

export const GeographicAlertScopeSchema = z.object({
  /** `world` ignores `macroRegions`. */
  coverage: z.enum(['world', 'custom']),
  macroRegions: z.array(MacroRegionCodeSchema).max(8).optional(),
});

export type GeographicAlertScope = z.infer<typeof GeographicAlertScopeSchema>;

export const AlertingPreferencesSchema = z.object({
  enabled: z.boolean(),
  watchedEntityRefs: z.array(EntityRefSchema).optional(),
  watchedCountryCodes: z.array(z.string().length(2)).optional(),
  watchedSignalFamilies: z.array(z.string().min(1)).optional(),
  minImportanceScore: z.number().int().min(0).max(100).optional(),
  cadenceMode: CadenceModeSchema.optional(),
  /**
   * Optional geographic scope for alerts (in addition to legacy `watchedCountryCodes` when set).
   * When omitted, treated as worldwide for macro-region logic.
   */
  geographicScope: GeographicAlertScopeSchema.optional(),
  /**
   * Allow-list of global registry source UUIDs. Empty/omitted = all catalog sources the workspace ingests.
   */
  enabledSourceIds: z.array(z.string().uuid()).max(500).optional(),
  /**
   * Market / equity index ids (same vocabulary as `LatestSignalDocument.marketIndexTagIds`).
   * When set, the authenticated signals feed can filter to these tags (GET `/v1/signals`).
   * Normalized on parse: lowercase, trim, dedupe.
   */
  watchedIndexIds: z
    .array(z.string())
    .max(32)
    .optional()
    .transform((arr) => {
      if (arr === undefined) return undefined;
      const n = normalizeMarketIndexTagIds(arr);
      return n.length > 0 ? n : [];
    }),
});

export type AlertingPreferences = z.infer<typeof AlertingPreferencesSchema>;

export const MemberPreferencesDocumentSchema = z.object({
  notifications: NotificationPreferencesSchema,
  digest: DigestPreferencesSchema.optional(),
  channels: ChannelPreferencesSchema.optional(),
  alerting: AlertingPreferencesSchema.optional(),
  updatedAt: z.date(),
});

export type MemberPreferencesDocument = z.infer<typeof MemberPreferencesDocumentSchema>;

export const FullPreferencesPayloadSchema = z.object({
  notifications: NotificationPreferencesSchema,
  digest: DigestPreferencesSchema.optional(),
  channels: ChannelPreferencesSchema.optional(),
  alerting: AlertingPreferencesSchema.optional(),
});

export type FullPreferencesPayload = z.infer<typeof FullPreferencesPayloadSchema>;

export const GetPreferencesResponseSchema = z.object({
  preferences: FullPreferencesPayloadSchema,
});

export type GetPreferencesResponse = z.infer<typeof GetPreferencesResponseSchema>;

export const SavePreferencesRequestSchema = z.object({
  preferences: FullPreferencesPayloadSchema,
});

export type SavePreferencesRequest = z.infer<typeof SavePreferencesRequestSchema>;

export const SavePreferencesResponseSchema = z.object({
  preferences: FullPreferencesPayloadSchema,
});

export type SavePreferencesResponse = z.infer<typeof SavePreferencesResponseSchema>;

export const TestDeliveryCTAResponseSchema = z.object({
  status: z.enum(['sent', 'failed', 'skipped']),
  message: z.string().optional(),
});

export type TestDeliveryCTAResponse = z.infer<typeof TestDeliveryCTAResponseSchema>;
