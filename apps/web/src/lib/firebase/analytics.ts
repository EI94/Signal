'use client';

import { type Analytics, getAnalytics, isSupported } from 'firebase/analytics';
import { getFirebaseApp } from './client';

let analyticsSingleton: Promise<Analytics | null> | null = null;

/**
 * Google Analytics (Firebase) — browser only. Returns null on server, unsupported environments, or if
 * `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` is unset.
 */
export function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }
  if (analyticsSingleton) {
    return analyticsSingleton;
  }
  analyticsSingleton = (async () => {
    if (!(await isSupported())) {
      return null;
    }
    try {
      return getAnalytics(getFirebaseApp());
    } catch {
      return null;
    }
  })();
  return analyticsSingleton;
}
