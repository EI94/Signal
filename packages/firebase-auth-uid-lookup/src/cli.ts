#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { normalizeAuthLookupEmail } from './normalize-email';

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const { values } = parseArgs({
    args,
    options: {
      email: { type: 'string' },
    },
  });

  const email = normalizeAuthLookupEmail(values.email ?? '');
  if (email === '') {
    console.error(
      'Usage: pnpm firebase-auth-uid -- --email someone@example.com\nRequires FIREBASE_PROJECT_ID and Application Default Credentials.',
    );
    process.exit(2);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) {
    console.error('FIREBASE_PROJECT_ID is required (e.g. signal-ac219).');
    process.exit(2);
  }

  const admin = (await import('firebase-admin')).default;
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  }

  try {
    const user = await admin.auth().getUserByEmail(email);
    console.log(user.uid);
    console.log(`email: ${user.email ?? email}`);
  } catch (e: unknown) {
    const code =
      typeof e === 'object' && e !== null && 'code' in e
        ? String((e as { code: string }).code)
        : '';
    if (code === 'auth/user-not-found') {
      console.error(`No Firebase Auth user for: ${email}`);
      process.exit(1);
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    process.exit(1);
  }
}

void main();
