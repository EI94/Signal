import {
  type FirebaseApp,
  type FirebaseOptions,
  getApp,
  getApps,
  initializeApp,
} from 'firebase/app';
import { getAuth } from 'firebase/auth';

/**
 * Public Firebase web config (browser-safe). Only NEXT_PUBLIC_* env vars.
 * Returns null if any required key is missing — UI should treat as "not configured".
 */
export function getFirebaseWebConfig(): FirebaseOptions | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) {
    return null;
  }
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim();
  const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim();
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    ...(storageBucket ? { storageBucket } : {}),
    ...(messagingSenderId ? { messagingSenderId } : {}),
    ...(measurementId ? { measurementId } : {}),
  };
}

export function isFirebaseWebConfigured(): boolean {
  return getFirebaseWebConfig() !== null;
}

export function getFirebaseApp(): FirebaseApp {
  const cfg = getFirebaseWebConfig();
  if (!cfg) {
    throw new Error(
      'Firebase web is not configured. Set NEXT_PUBLIC_FIREBASE_API_KEY, AUTH_DOMAIN, PROJECT_ID, APP_ID.',
    );
  }
  if (getApps().length === 0) {
    initializeApp(cfg);
  }
  return getApp();
}

export function getFirebaseClientAuth() {
  return getAuth(getFirebaseApp());
}
