/**
 * WS10.3 — client fixtures still satisfy @signal/contracts after API responses (regression guard).
 */

import {
  BoardSummaryV1ResponseSchema,
  EntityDetailV1ResponseSchema,
  MapSignalsV1ResponseSchema,
  NotificationsListV1ResponseSchema,
  SignalsFeedV1ResponseSchema,
} from '@signal/contracts';
import { describe, expect, it } from 'vitest';

const sampleSignal = {
  signalId: 'sig-1',
  signalType: 'project_award',
  title: 'T',
  shortSummary: null,
  status: 'active',
  novelty: 'new',
  compositeScore: 80,
  occurredAt: '2026-04-04T10:00:00.000Z',
  detectedAt: '2026-04-04T12:00:00.000Z',
};

describe('web client ↔ contract shape', () => {
  it('board summary fixture', () => {
    const r = BoardSummaryV1ResponseSchema.safeParse({
      workspaceId: 'ws-1',
      generatedAt: '2026-04-05T12:00:00.000Z',
      asOf: '2026-04-05T11:55:00.000Z',
      topSignals: [sampleSignal],
    });
    expect(r.success).toBe(true);
  });

  it('signals feed fixture', () => {
    const r = SignalsFeedV1ResponseSchema.safeParse({
      workspaceId: 'ws-1',
      items: [sampleSignal],
      nextPageToken: null,
    });
    expect(r.success).toBe(true);
  });

  it('entity detail minimal fixture', () => {
    const r = EntityDetailV1ResponseSchema.safeParse({
      workspaceId: 'ws-1',
      entity: { entityType: 'company', entityId: 'c1', displayName: 'ACME' },
      recentSignals: [],
    });
    expect(r.success).toBe(true);
  });

  it('map signals fixture', () => {
    const r = MapSignalsV1ResponseSchema.safeParse({
      workspaceId: 'ws-1',
      points: [
        {
          signalId: 's1',
          signalType: 'project_award',
          title: 'T',
          status: 'active',
          occurredAt: '2026-04-04T10:00:00.000Z',
          detectedAt: '2026-04-04T12:00:00.000Z',
          lat: 45.4,
          lng: 9.2,
        },
      ],
      nextPageToken: null,
    });
    expect(r.success).toBe(true);
  });

  it('notifications list fixture', () => {
    const r = NotificationsListV1ResponseSchema.safeParse({
      workspaceId: 'ws-1',
      items: [],
      nextPageToken: null,
    });
    expect(r.success).toBe(true);
  });
});
