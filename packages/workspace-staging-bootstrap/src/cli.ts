#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { WorkspaceRoleSchema } from '@signal/contracts';
import type admin from 'firebase-admin';
import { runStagingWorkspaceBootstrap } from './firestore-upsert';

const DEFAULT_WORKSPACE_ID = 'ws_maire_staging';

function printSummary(
  r: Awaited<ReturnType<typeof runStagingWorkspaceBootstrap>>,
  apply: boolean,
): void {
  const mode = apply ? 'apply' : 'dry-run';
  console.log(`Workspace staging bootstrap (${mode})\n`);
  console.log(`  workspaceId: ${r.workspaceId}`);
  console.log(`  uid:         ${r.uid}`);
  console.log(`  workspace:   ${r.workspace}`);
  console.log(`  member:      ${r.member}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      uid: { type: 'string' },
      workspace: { type: 'string', default: DEFAULT_WORKSPACE_ID },
      role: { type: 'string', default: 'admin' },
      apply: { type: 'boolean', default: false },
    },
  });

  const uidFromFlag = values.uid?.trim();
  const uidFromPos = positionals[0]?.trim();
  const uid = uidFromFlag || uidFromPos || '';
  if (uid === '') {
    console.error(
      'Usage: pnpm --filter @signal/workspace-staging-bootstrap run bootstrap -- --uid <firebase_uid> [--workspace ws_maire_staging] [--role admin|analyst|viewer] [--apply]',
    );
    console.error('Or pass <firebase_uid> as first positional argument.');
    process.exit(2);
  }

  const workspaceId = (values.workspace ?? DEFAULT_WORKSPACE_ID).trim();
  const roleParse = WorkspaceRoleSchema.safeParse(values.role ?? 'admin');
  if (!roleParse.success) {
    console.error(`Invalid --role: ${values.role}`);
    process.exit(2);
  }

  const apply = values.apply === true;
  let db: admin.firestore.Firestore | null = null;
  if (apply) {
    const adminMod = (await import('firebase-admin')).default;
    const { getFirestore } = await import('firebase-admin/firestore');
    const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
    if (!projectId) {
      console.error('FIREBASE_PROJECT_ID is required for --apply (e.g. signal-ac219).');
      process.exit(2);
    }
    if (!adminMod.apps.length) {
      adminMod.initializeApp({
        credential: adminMod.credential.applicationDefault(),
        projectId,
      });
    }
    const databaseId = process.env.FIRESTORE_DATABASE_ID?.trim() || 'default';
    db = getFirestore(adminMod.app(), databaseId);
  }

  const report = await runStagingWorkspaceBootstrap({
    db,
    workspaceId,
    uid,
    role: roleParse.data,
    now: new Date(),
    apply,
  });

  printSummary(report, apply);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
