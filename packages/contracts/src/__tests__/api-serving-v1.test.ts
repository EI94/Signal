import { describe, expect, it } from 'vitest';
import { AlertRulesListV1ResponseSchema } from '../api-alerts';
import { BoardSummaryV1ResponseSchema } from '../api-board-summary';
import { BriefMetadataV1Schema, BriefsListV1ResponseSchema } from '../api-briefs';
import {
  EntityDetailQueryV1Schema,
  EntityDetailV1ResponseSchema,
  EntityPathParamsV1Schema,
} from '../api-entities';
import { ApiErrorEnvelopeV1Schema } from '../api-error-envelope';
import {
  InternalSourceSummaryV1Schema,
  InternalToolExecutionRequestV1Schema,
} from '../api-internal-v1';
import {
  MapSignalPointV1Schema,
  MapSignalsQueryV1Schema,
  MapSignalsV1ResponseSchema,
} from '../api-map';
import {
  NotificationPatchBodyV1Schema,
  NotificationPatchV1ResponseSchema,
  NotificationPathParamsV1Schema,
  NotificationsListQueryV1Schema,
  NotificationsListV1ResponseSchema,
} from '../api-notifications';
import {
  CursorPaginationQueryV1Schema,
  SignalSummaryV1Schema,
  WorkspaceScopeQueryV1Schema,
} from '../api-serving-shared';
import { SignalsFeedQueryV1Schema, SignalsFeedV1ResponseSchema } from '../api-signals';

const sampleSignal = {
  signalId: 'sig-1',
  signalType: 'project_award',
  title: 'Award',
  status: 'active',
  occurredAt: '2026-04-04T12:00:00.000Z',
  detectedAt: '2026-04-04T12:05:00.000Z',
};

describe('api-serving-shared', () => {
  it('parses SignalSummaryV1', () => {
    expect(SignalSummaryV1Schema.parse(sampleSignal).signalId).toBe('sig-1');
  });

  it('parses cursor pagination query', () => {
    const q = CursorPaginationQueryV1Schema.parse({ limit: '25', cursor: 'abc' });
    expect(q.limit).toBe(25);
    expect(q.cursor).toBe('abc');
  });

  it('parses workspace scope query', () => {
    expect(WorkspaceScopeQueryV1Schema.parse({}).workspaceId).toBeUndefined();
    expect(WorkspaceScopeQueryV1Schema.parse({ workspaceId: 'ws' }).workspaceId).toBe('ws');
  });
});

describe('board summary', () => {
  it('parses board response', () => {
    const r = BoardSummaryV1ResponseSchema.parse({
      workspaceId: 'ws',
      generatedAt: '2026-04-04T12:00:00.000Z',
      asOf: '2026-04-04T12:00:00.000Z',
      topSignals: [sampleSignal],
    });
    expect(r.topSignals).toHaveLength(1);
  });
});

describe('signals feed', () => {
  it('parses marketIndexTags from comma-separated query', () => {
    const q = SignalsFeedQueryV1Schema.parse({
      limit: '10',
      marketIndexTags: 'spx,eurostoxx',
    });
    expect(q.marketIndexTags).toEqual(['spx', 'eurostoxx']);
  });

  it('merges feed query fields', () => {
    const q = SignalsFeedQueryV1Schema.parse({
      limit: '10',
      signalType: 'project_award',
      sort: 'score_desc',
    });
    expect(q.limit).toBe(10);
    expect(q.sort).toBe('score_desc');
  });

  it('parses feed response', () => {
    const r = SignalsFeedV1ResponseSchema.parse({
      workspaceId: 'ws',
      items: [sampleSignal],
      nextPageToken: null,
    });
    expect(r.nextPageToken).toBeNull();
  });

  it('parses feed query with entity + date bounds', () => {
    const q = SignalsFeedQueryV1Schema.parse({
      entityType: 'company',
      entityId: 'c1',
      detectedAfter: '2026-01-01T00:00:00.000Z',
      detectedBefore: '2026-12-31T23:59:59.000Z',
      includeFacets: 'false',
    });
    expect(q.entityType).toBe('company');
    expect(q.includeFacets).toBe(false);
  });

  it('rejects mismatched entity filter', () => {
    expect(() =>
      SignalsFeedQueryV1Schema.parse({ entityType: 'x', entityId: undefined }),
    ).toThrow();
  });
});

describe('entities', () => {
  it('parses path params', () => {
    expect(EntityPathParamsV1Schema.parse({ entityType: 'company', entityId: 'e1' })).toEqual({
      entityType: 'company',
      entityId: 'e1',
    });
  });

  it('parses entity detail', () => {
    const r = EntityDetailV1ResponseSchema.parse({
      workspaceId: 'ws',
      entity: { entityType: 'company', entityId: 'e1', displayName: 'Acme' },
      recentSignals: [sampleSignal],
      timelineNextCursor: null,
    });
    expect(r.entity.displayName).toBe('Acme');
  });

  it('parses entity detail query', () => {
    const q = EntityDetailQueryV1Schema.parse({
      timelineLimit: '8',
      timelineSignalType: 'project_award',
    });
    expect(q.timelineLimit).toBe(8);
  });
});

describe('map', () => {
  it('parses map query', () => {
    const q = MapSignalsQueryV1Schema.parse({ minScore: '50' });
    expect(q.minScore).toBe(50);
  });

  it('allows optional geo on points', () => {
    const p = MapSignalPointV1Schema.parse({
      ...sampleSignal,
      lat: 45.4,
      lng: 9.2,
    });
    expect(p.lat).toBe(45.4);
  });

  it('parses map response', () => {
    const r = MapSignalsV1ResponseSchema.parse({
      workspaceId: 'ws',
      points: [{ ...sampleSignal, regionKey: 'EU-West' }],
      nextPageToken: null,
    });
    expect(r.points[0]?.regionKey).toBe('EU-West');
  });
});

describe('briefs', () => {
  it('parses brief metadata', () => {
    const b = BriefMetadataV1Schema.parse({
      briefId: 'b1',
      briefType: 'weekly',
      periodStart: '2026-04-01T00:00:00.000Z',
      periodEnd: '2026-04-07T23:59:59.000Z',
      status: 'ready',
      updatedAt: '2026-04-08T10:00:00.000Z',
    });
    expect(b.briefId).toBe('b1');
  });

  it('parses list response', () => {
    BriefsListV1ResponseSchema.parse({
      workspaceId: 'ws',
      items: [],
      nextPageToken: undefined,
    });
  });
});

describe('alerts', () => {
  it('parses rules list', () => {
    AlertRulesListV1ResponseSchema.parse({
      workspaceId: 'ws',
      items: [
        {
          ruleId: 'r1',
          name: 'High score',
          isActive: true,
          updatedAt: '2026-04-04T12:00:00.000Z',
        },
      ],
    });
  });
});

describe('notifications', () => {
  it('parses list query with status filter', () => {
    const q = NotificationsListQueryV1Schema.parse({ status: 'unread', limit: '5' });
    expect(q.status).toBe('unread');
    expect(q.limit).toBe(5);
  });

  it('parses list response', () => {
    NotificationsListV1ResponseSchema.parse({
      workspaceId: 'ws',
      items: [
        {
          notificationId: 'n1',
          type: 'signal',
          title: 'New',
          status: 'unread',
          signalId: 'sig-1',
          createdAt: '2026-04-04T12:00:00.000Z',
        },
      ],
      nextPageToken: null,
    });
  });

  it('parses patch path params and body', () => {
    expect(NotificationPathParamsV1Schema.parse({ notificationId: 'n1' }).notificationId).toBe(
      'n1',
    );
    expect(NotificationPatchBodyV1Schema.parse({ status: 'read' }).status).toBe('read');
  });

  it('parses patch response', () => {
    const r = NotificationPatchV1ResponseSchema.parse({
      notification: {
        notificationId: 'n1',
        type: 'signal',
        title: 'New',
        status: 'read',
        createdAt: '2026-04-04T12:00:00.000Z',
      },
    });
    expect(r.notification.status).toBe('read');
  });
});

describe('internal v1', () => {
  it('accepts tool execution request shape', () => {
    InternalToolExecutionRequestV1Schema.parse({
      tool: 'extract_events',
      input: {},
      correlationId: 'c',
    });
  });

  it('parses internal source summary', () => {
    InternalSourceSummaryV1Schema.parse({
      sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      registrySourceType: 'web_page',
      sourceUrl: 'https://example.com',
    });
  });
});

describe('api error envelope', () => {
  it('matches stable error shape', () => {
    const e = ApiErrorEnvelopeV1Schema.parse({
      error: { code: 'forbidden', message: 'no', requestId: 'req-1' },
    });
    expect(e.error.requestId).toBe('req-1');
  });
});
