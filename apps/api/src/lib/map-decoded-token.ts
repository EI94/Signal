import type { DecodedIdToken } from 'firebase-admin/auth';
import type { AuthPrincipal } from '../types/auth-principal';

const RESERVED_CLAIM_KEYS = new Set([
  'aud',
  'auth_time',
  'exp',
  'iat',
  'iss',
  'sub',
  'uid',
  'email',
  'email_verified',
  'name',
  'picture',
  'user_id',
  'firebase',
]);

export function mapDecodedIdTokenToPrincipal(decoded: DecodedIdToken): AuthPrincipal {
  const customClaims: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(decoded)) {
    if (!RESERVED_CLAIM_KEYS.has(key)) {
      customClaims[key] = value;
    }
  }

  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    emailVerified: !!decoded.email_verified,
    displayName: typeof decoded.name === 'string' ? decoded.name : null,
    photoUrl: typeof decoded.picture === 'string' ? decoded.picture : null,
    signInProvider: decoded.firebase?.sign_in_provider ?? null,
    customClaims,
  };
}
