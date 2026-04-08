import type { BigQuery } from '@google-cloud/bigquery';
import type { ApiRuntimeConfig } from '@signal/config';
import {
  AlertRulesListV1ResponseSchema,
  BoardSummaryV1ResponseSchema,
  BriefDetailV1ResponseSchema,
  BriefsListV1ResponseSchema,
  CursorPaginationQueryV1Schema,
  EntityDetailQueryV1Schema,
  EntityDetailV1ResponseSchema,
  EntityPathParamsV1Schema,
  MapSignalsQueryV1Schema,
  MapSignalsV1ResponseSchema,
  NotificationPatchBodyV1Schema,
  NotificationPatchV1ResponseSchema,
  NotificationPathParamsV1Schema,
  NotificationsListQueryV1Schema,
  NotificationsListV1ResponseSchema,
  SignalsFeedQueryV1Schema,
  SignalsFeedV1ResponseSchema,
  WorkspaceScopeQueryV1Schema,
} from '@signal/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { sendErrorResponse } from '../lib/api-error';
import { getFirestoreDb } from '../lib/firebase-admin';
import { optionalVerifyAuth, requireAuth } from '../plugins/auth';
import {
  createResolveWorkspaceMembership,
  createResolveWorkspacePublicOrMember,
} from '../plugins/workspace';
import { buildAlertRulesListReadModel } from '../read-models/alert-rules-list';
import { buildBoardSummaryFromWindow } from '../read-models/board-summary';
import {
  buildBriefDetailReadModel,
  buildBriefsListReadModel,
} from '../read-models/briefs-read-model';
import { buildEntityDetailReadModel } from '../read-models/entity-detail';
import { buildGeographyEntityIndex } from '../read-models/geography-index';
import { buildMapSignalsFromWindow } from '../read-models/map-signals';
import { patchWorkspaceNotification } from '../read-models/notification-patch';
import { buildNotificationsListReadModel } from '../read-models/notifications-list';
import { buildSignalsFeedFromWindow } from '../read-models/signals-feed';
import { loadLatestSignalsWindow } from '../read-models/signals-window';

const BriefsListQueryV1Schema = CursorPaginationQueryV1Schema.merge(WorkspaceScopeQueryV1Schema);

function assertWorkspaceQueryMatchesResolved(
  request: { workspaceContext?: { id: string } },
  reply: import('fastify').FastifyReply,
  raw: import('fastify').FastifyRequest,
  query: { workspaceId?: string | undefined },
): boolean {
  const resolved = request.workspaceContext?.id;
  if (!resolved) {
    void sendErrorResponse(reply, raw, 500, 'INTERNAL', 'Workspace context missing');
    return false;
  }
  if (query.workspaceId !== undefined && query.workspaceId !== resolved) {
    void sendErrorResponse(
      reply,
      raw,
      400,
      'BAD_REQUEST',
      'workspaceId does not match resolved workspace',
    );
    return false;
  }
  return true;
}

export const servingV1Routes: FastifyPluginAsync<{
  config: ApiRuntimeConfig;
  bigquery: BigQuery | null;
}> = async (app, opts) => {
  const { config, bigquery } = opts;
  const resolveWorkspace = createResolveWorkspaceMembership(config);
  const resolvePublicOrMember = createResolveWorkspacePublicOrMember(config);
  const preAuth = [requireAuth, resolveWorkspace] as const;
  const prePublicRead = [optionalVerifyAuth, resolvePublicOrMember] as const;

  app.get('/board/summary', { preHandler: [...prePublicRead] }, async (request, reply) => {
    const wc = request.workspaceContext;
    if (!wc) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Workspace context missing');
      return;
    }
    const db = getFirestoreDb();
    const [window, geoIndex] = await Promise.all([
      loadLatestSignalsWindow(db, wc.id),
      buildGeographyEntityIndex(db, wc.id),
    ]);
    const body = buildBoardSummaryFromWindow(wc.id, window, geoIndex);
    const parsed = BoardSummaryV1ResponseSchema.safeParse(body);
    if (!parsed.success) {
      request.log.error(
        { issues: parsed.error.flatten() },
        'board summary response validation failed',
      );
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    return parsed.data;
  });

  app.get('/signals', { preHandler: [...prePublicRead] }, async (request, reply) => {
    const wc = request.workspaceContext;
    if (!wc) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Workspace context missing');
      return;
    }
    const q = SignalsFeedQueryV1Schema.safeParse(request.query);
    if (!q.success) {
      await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid query parameters');
      return;
    }
    if (!assertWorkspaceQueryMatchesResolved(request, reply, request, q.data)) {
      return;
    }
    const db = getFirestoreDb();
    const [window, geoIndex] = await Promise.all([
      loadLatestSignalsWindow(db, wc.id),
      buildGeographyEntityIndex(db, wc.id),
    ]);
    const built = buildSignalsFeedFromWindow(window, q.data, geoIndex);
    const body = { workspaceId: wc.id, ...built };
    const parsed = SignalsFeedV1ResponseSchema.safeParse(body);
    if (!parsed.success) {
      request.log.error(
        { issues: parsed.error.flatten() },
        'signals feed response validation failed',
      );
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    return parsed.data;
  });

  app.get(
    '/entities/:entityType/:entityId',
    { preHandler: [...prePublicRead] },
    async (request, reply) => {
      const wc = request.workspaceContext;
      if (!wc) {
        await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Workspace context missing');
        return;
      }
      const p = EntityPathParamsV1Schema.safeParse(request.params);
      if (!p.success) {
        await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid path parameters');
        return;
      }
      const eq = EntityDetailQueryV1Schema.safeParse(request.query);
      if (!eq.success) {
        await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid query parameters');
        return;
      }
      if (!assertWorkspaceQueryMatchesResolved(request, reply, request, eq.data)) {
        return;
      }
      const body = await buildEntityDetailReadModel({
        config,
        bigquery,
        workspaceId: wc.id,
        entityType: p.data.entityType,
        entityId: p.data.entityId,
        query: eq.data,
      });
      const parsed = EntityDetailV1ResponseSchema.safeParse(body);
      if (!parsed.success) {
        request.log.error(
          { issues: parsed.error.flatten() },
          'entity detail response validation failed',
        );
        await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
        return;
      }
      return parsed.data;
    },
  );

  app.get('/map/signals', { preHandler: [...prePublicRead] }, async (request, reply) => {
    const wc = request.workspaceContext;
    if (!wc) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Workspace context missing');
      return;
    }
    const q = MapSignalsQueryV1Schema.safeParse(request.query);
    if (!q.success) {
      await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid query parameters');
      return;
    }
    if (!assertWorkspaceQueryMatchesResolved(request, reply, request, q.data)) {
      return;
    }
    const window = await loadLatestSignalsWindow(getFirestoreDb(), wc.id);
    const built = buildMapSignalsFromWindow(window, q.data);
    const body = { workspaceId: wc.id, points: built.points, nextPageToken: built.nextPageToken };
    const parsed = MapSignalsV1ResponseSchema.safeParse(body);
    if (!parsed.success) {
      request.log.error(
        { issues: parsed.error.flatten() },
        'map signals response validation failed',
      );
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    return parsed.data;
  });

  app.get('/notifications', { preHandler: [...preAuth] }, async (request, reply) => {
    const wc = request.workspaceContext;
    const uid = request.authUser?.uid;
    if (!wc || !uid) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Workspace or user context missing');
      return;
    }
    const q = NotificationsListQueryV1Schema.safeParse(request.query);
    if (!q.success) {
      await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid query parameters');
      return;
    }
    if (!assertWorkspaceQueryMatchesResolved(request, reply, request, q.data)) {
      return;
    }
    const body = await buildNotificationsListReadModel({ workspaceId: wc.id, uid, query: q.data });
    const parsed = NotificationsListV1ResponseSchema.safeParse(body);
    if (!parsed.success) {
      request.log.error(
        { issues: parsed.error.flatten() },
        'notifications response validation failed',
      );
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    return parsed.data;
  });

  app.patch(
    '/notifications/:notificationId',
    { preHandler: [...preAuth] },
    async (request, reply) => {
      const wc = request.workspaceContext;
      const uid = request.authUser?.uid;
      if (!wc || !uid) {
        await sendErrorResponse(
          reply,
          request,
          500,
          'INTERNAL',
          'Workspace or user context missing',
        );
        return;
      }
      const q = WorkspaceScopeQueryV1Schema.safeParse(request.query);
      if (!q.success) {
        await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid query parameters');
        return;
      }
      if (!assertWorkspaceQueryMatchesResolved(request, reply, request, q.data)) {
        return;
      }
      const p = NotificationPathParamsV1Schema.safeParse(request.params);
      if (!p.success) {
        await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid path parameters');
        return;
      }
      const body = NotificationPatchBodyV1Schema.safeParse(request.body);
      if (!body.success) {
        await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid request body');
        return;
      }

      const result = await patchWorkspaceNotification({
        db: getFirestoreDb(),
        workspaceId: wc.id,
        notificationId: p.data.notificationId,
        uid,
        requestedStatus: body.data.status,
      });

      if (!result.ok) {
        if (result.error.code === 'not_found') {
          await sendErrorResponse(reply, request, 404, 'NOT_FOUND', 'Notification not found');
          return;
        }
        if (result.error.code === 'forbidden') {
          await sendErrorResponse(
            reply,
            request,
            403,
            'FORBIDDEN',
            'Not allowed to update this notification',
          );
          return;
        }
        if (result.error.code === 'broadcast_immutable') {
          await sendErrorResponse(
            reply,
            request,
            409,
            'BROADCAST_NOTIFICATION_IMMUTABLE',
            'Workspace broadcast notifications cannot be updated via this API',
          );
          return;
        }
        await sendErrorResponse(
          reply,
          request,
          409,
          'CONFLICT',
          'Cannot apply the requested status to this notification',
        );
        return;
      }

      const envelope = { notification: result.notification };
      const parsed = NotificationPatchV1ResponseSchema.safeParse(envelope);
      if (!parsed.success) {
        request.log.error(
          { issues: parsed.error.flatten() },
          'notification patch response validation failed',
        );
        await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
        return;
      }
      return parsed.data;
    },
  );

  app.get('/briefs', { preHandler: [...preAuth] }, async (request, reply) => {
    const wc = request.workspaceContext;
    if (!wc) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Workspace context missing');
      return;
    }
    const q = BriefsListQueryV1Schema.safeParse(request.query);
    if (!q.success) {
      await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid query parameters');
      return;
    }
    if (!assertWorkspaceQueryMatchesResolved(request, reply, request, q.data)) {
      return;
    }
    const body = await buildBriefsListReadModel({ workspaceId: wc.id, query: q.data });
    const parsed = BriefsListV1ResponseSchema.safeParse(body);
    if (!parsed.success) {
      request.log.error(
        { issues: parsed.error.flatten() },
        'briefs list response validation failed',
      );
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    return parsed.data;
  });

  app.get('/briefs/:briefId', { preHandler: [...preAuth] }, async (request, reply) => {
    const wc = request.workspaceContext;
    if (!wc) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Workspace context missing');
      return;
    }
    const params = request.params as { briefId?: unknown };
    const briefId = typeof params.briefId === 'string' ? params.briefId.trim() : '';
    if (!briefId) {
      await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid brief id');
      return;
    }
    const detail = await buildBriefDetailReadModel({ workspaceId: wc.id, briefId });
    if (!detail) {
      await sendErrorResponse(reply, request, 404, 'NOT_FOUND', 'Brief not found');
      return;
    }
    const parsed = BriefDetailV1ResponseSchema.safeParse(detail);
    if (!parsed.success) {
      request.log.error(
        { issues: parsed.error.flatten() },
        'brief detail response validation failed',
      );
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    return parsed.data;
  });

  app.get('/alerts/rules', { preHandler: [...preAuth] }, async (request, reply) => {
    const wc = request.workspaceContext;
    if (!wc) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Workspace context missing');
      return;
    }
    const body = await buildAlertRulesListReadModel(wc.id);
    const parsed = AlertRulesListV1ResponseSchema.safeParse(body);
    if (!parsed.success) {
      request.log.error(
        { issues: parsed.error.flatten() },
        'alert rules response validation failed',
      );
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    return parsed.data;
  });
};
