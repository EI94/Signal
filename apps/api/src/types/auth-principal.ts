/** Verified Firebase user attached to the request after token verification. */
export type AuthPrincipal = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoUrl: string | null;
  signInProvider: string | null;
  customClaims: Record<string, unknown>;
};
