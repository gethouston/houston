"use client";

/**
 * The store's sign-in session, modeled on packages/web's popup precedent: a
 * single React context owns the GCIP session, exposes the current user, and hands
 * out a fresh bearer for authed gateway calls. Server components never see a
 * token — only client components under this provider do, via `useSession`.
 *
 * Sign-in is a Google popup (`signInWithPopup` + `GoogleAuthProvider`). The token
 * is always read live through `getIdToken()` (the SDK silently refreshes it), so
 * a long-idle tab still sends a valid bearer. When the store is not configured
 * for auth, the provider reports `status: "unconfigured"` and sign-in is a no-op
 * that surfaces a clear error rather than crashing the tree.
 */
import {
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  type User,
} from "firebase/auth";
import * as React from "react";
import { getFirebaseAuth, isAuthConfigured } from "./firebase";

/** The signed-in user's display identity (a projection of the Firebase `User`). */
export interface SessionUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

/** Lifecycle of the session: still resolving, ready to sign in, or signed in. */
export type SessionStatus =
  | "loading"
  | "signed-out"
  | "signed-in"
  | "unconfigured";

export interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  /** Open the Google sign-in popup. Rejects on popup close or auth failure. */
  signIn: () => Promise<void>;
  /** Sign out and clear the local session. */
  signOut: () => Promise<void>;
  /** A fresh ID token for the bearer, or null when signed out. */
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

/** Access the session. Must be called under a `SessionProvider`. */
export function useSession(): SessionContextValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider.");
  }
  return ctx;
}
