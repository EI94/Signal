'use client';

import type { User } from 'firebase/auth';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getFirebaseClientAuth, isFirebaseWebConfigured } from '../../lib/firebase/client';

export type AuthContextValue = {
  readonly configured: boolean;
  readonly loading: boolean;
  readonly user: User | null;
  readonly signInWithGoogle: () => Promise<void>;
  readonly signInWithEmail: (email: string, password: string) => Promise<void>;
  readonly signUpWithEmail: (email: string, password: string) => Promise<void>;
  readonly resetPassword: (email: string) => Promise<void>;
  readonly sendVerificationEmail: () => Promise<void>;
  readonly signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isFirebaseWebConfigured();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    if (!configured) {
      setUser(null);
      return;
    }
    const auth = getFirebaseClientAuth();
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, [configured]);

  const signInWithGoogle = useCallback(async () => {
    if (!configured) return;
    const auth = getFirebaseClientAuth();
    await signInWithPopup(auth, new GoogleAuthProvider());
  }, [configured]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!configured) return;
      const auth = getFirebaseClientAuth();
      await signInWithEmailAndPassword(auth, email, password);
    },
    [configured],
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!configured) return;
      const auth = getFirebaseClientAuth();
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(cred.user);
    },
    [configured],
  );

  const resetPassword = useCallback(
    async (email: string) => {
      if (!configured) return;
      const auth = getFirebaseClientAuth();
      await sendPasswordResetEmail(auth, email);
    },
    [configured],
  );

  const sendVerificationEmail = useCallback(async () => {
    if (!configured || !user) return;
    await sendEmailVerification(user);
  }, [configured, user]);

  const signOutUser = useCallback(async () => {
    if (!configured) return;
    await signOut(getFirebaseClientAuth());
  }, [configured]);

  const value = useMemo((): AuthContextValue => {
    const loading = configured && user === undefined;
    return {
      configured,
      loading,
      user: user === undefined || user === null ? null : user,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      resetPassword,
      sendVerificationEmail,
      signOutUser,
    };
  }, [
    configured,
    user,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    sendVerificationEmail,
    signOutUser,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
