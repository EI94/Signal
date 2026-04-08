import type { WorkspaceRole } from '@signal/contracts';
import {
  type WorkspaceMemberDocument,
  WorkspaceMemberDocumentSchema,
  type WorkspaceRootDocument,
  WorkspaceRootDocumentSchema,
} from '@signal/contracts/firestore-operational';
import type admin from 'firebase-admin';
import {
  preserveMemberJoinedTimestamps,
  preserveWorkspaceRootTimestamps,
} from './merge-preserving';

export type WriteOutcome = 'created' | 'updated';

function coerceFirestoreDate(value: unknown): Date | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value;
  const td = (value as { toDate?: () => Date }).toDate;
  if (typeof td === 'function') {
    return td.call(value);
  }
  return undefined;
}

const STAGING_WORKSPACE_NAME = 'MAIRE Staging';

export type StagingBootstrapSummary = {
  readonly workspaceId: string;
  readonly uid: string;
  readonly workspace: 'dry-run' | WriteOutcome;
  readonly member: 'dry-run' | WriteOutcome;
};

export async function runStagingWorkspaceBootstrap(params: {
  readonly db: admin.firestore.Firestore | null;
  readonly workspaceId: string;
  readonly uid: string;
  readonly role: WorkspaceRole;
  readonly now: Date;
  readonly apply: boolean;
}): Promise<StagingBootstrapSummary> {
  const { workspaceId, uid, role, now, apply } = params;

  if (!apply || !params.db) {
    return {
      workspaceId,
      uid,
      workspace: 'dry-run',
      member: 'dry-run',
    };
  }

  const db = params.db;

  const wsRef = db.collection('workspaces').doc(workspaceId);
  const memRef = wsRef.collection('members').doc(uid);

  const wsSnap = await wsRef.get();
  const prevWsCreated = wsSnap.exists ? coerceFirestoreDate(wsSnap.data()?.createdAt) : undefined;
  const wsTimes = preserveWorkspaceRootTimestamps(prevWsCreated, {
    createdAt: now,
    updatedAt: now,
  });
  const workspaceDoc: WorkspaceRootDocument = {
    name: STAGING_WORKSPACE_NAME,
    slug: null,
    isActive: true,
    createdAt: wsTimes.createdAt,
    updatedAt: wsTimes.updatedAt,
  };
  const wsOk = WorkspaceRootDocumentSchema.safeParse(workspaceDoc);
  if (!wsOk.success) {
    throw new Error(`workspace doc invalid: ${wsOk.error.message}`);
  }
  await wsRef.set(wsOk.data);
  const workspace: WriteOutcome = wsSnap.exists ? 'updated' : 'created';

  const memSnap = await memRef.get();
  const prevJoined = memSnap.exists ? coerceFirestoreDate(memSnap.data()?.joinedAt) : undefined;
  const memTimes = preserveMemberJoinedTimestamps(prevJoined, {
    joinedAt: now,
    updatedAt: now,
  });
  const memberDoc: WorkspaceMemberDocument = {
    uid,
    role,
    isActive: true,
    joinedAt: memTimes.joinedAt,
    updatedAt: memTimes.updatedAt,
  };
  const memOk = WorkspaceMemberDocumentSchema.safeParse(memberDoc);
  if (!memOk.success) {
    throw new Error(`member doc invalid: ${memOk.error.message}`);
  }
  await memRef.set(memOk.data);
  const member: WriteOutcome = memSnap.exists ? 'updated' : 'created';

  return { workspaceId, uid, workspace, member };
}
