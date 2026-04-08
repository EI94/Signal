/**
 * Boundary parsers for operational Firestore documents (future routes / jobs).
 * Validates normalized snapshot data; does not perform reads.
 */
import {
  AlertRuleDocumentSchema,
  BriefDocumentSchema,
  FeatureFlagDocumentSchema,
  LatestSignalDocumentSchema,
  NotificationDocumentSchema,
  SavedViewDocumentSchema,
  SourceRegistryDocumentSchema,
  WatchlistDocumentSchema,
} from '@signal/contracts';
import { normalizeFirestoreTimestamps } from './timestamps';

function norm(raw: unknown): Record<string, unknown> {
  return normalizeFirestoreTimestamps((raw ?? {}) as Record<string, unknown>);
}

export function parseWatchlistDocument(raw: unknown) {
  return WatchlistDocumentSchema.safeParse(norm(raw));
}

export function parseSavedViewDocument(raw: unknown) {
  return SavedViewDocumentSchema.safeParse(norm(raw));
}

export function parseLatestSignalDocument(raw: unknown) {
  return LatestSignalDocumentSchema.safeParse(norm(raw));
}

export function parseNotificationDocument(raw: unknown) {
  return NotificationDocumentSchema.safeParse(norm(raw));
}

export function parseFeatureFlagDocument(raw: unknown) {
  return FeatureFlagDocumentSchema.safeParse(norm(raw));
}

export function parseBriefDocument(raw: unknown) {
  return BriefDocumentSchema.safeParse(norm(raw));
}

export function parseAlertRuleDocument(raw: unknown) {
  return AlertRuleDocumentSchema.safeParse(norm(raw));
}

export function parseSourceRegistryDocument(raw: unknown) {
  return SourceRegistryDocumentSchema.safeParse(norm(raw));
}
