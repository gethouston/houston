"use client";

import {
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  type User,
} from "firebase/auth";
import * as React from "react";
import { getFirebaseAuth, isAuthConfigured } from "./firebase";

export interface SessionUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export type SessionStatus =
  | "loading"
  | "signed-out"
  | "signed-in"
  | "unconfigured";

export interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

function toSessionUser(user: User): SessionUser {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const configured = isAuthConfigured();
  const [user, setUser] = React.useState<User | null>(null);
  const [status, setStatus] = React.useState<SessionStatus>(
    configured ? "loading" : "unconfigured",
  );

  React.useEffect(() => {
    if (!configured) return;
    const unsubscribe = onIdTokenChanged(
      getFirebaseAuth(),
      (next: User | null) => {
        setUser(next);
        setStatus(next ? "signed-in" : "signed-out");
      },
    );
    return unsubscribe;
  }, [configured]);

  const signIn = React.useCallback(async () => {
    if (!configured) {
      throw new Error("Sign-in is not available on this deployment.");
    }
    await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
  }, [configured]);

  const signOut = React.useCallback(async () => {
    if (!configured) return;
    await firebaseSignOut(getFirebaseAuth());
  }, [configured]);

  const getToken = React.useCallback(async () => {
    if (!configured || !user) return null;
    return user.getIdToken();
  }, [configured, user]);

  const value = React.useMemo<SessionContextValue>(
    () => ({
      status,
      user: user ? toSessionUser(user) : null,
      signIn,
      signOut,
      getToken,
    }),
    [status, user, signIn, signOut, getToken],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useOptionalSession(): SessionContextValue | null {
  return React.useContext(SessionContext);
}

export function useSession(): SessionContextValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider.");
  }
  return ctx;
}
