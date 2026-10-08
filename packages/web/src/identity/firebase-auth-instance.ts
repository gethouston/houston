// The Firebase Auth singleton behind the web sign-in surface (firebase-popup.ts).

import { IdentityError } from "@houston/app/lib/identity";
import { osIsNativeMobile } from "@houston/app/lib/os-bridge/platform";
import { type FirebaseApp, initializeApp } from "firebase/app";
import {
  type Auth,
  browserLocalPersistence,
  getAuth,
  initializeAuth,
  setPersistence,
} from "firebase/auth";

let authInstance: Auth | null = null;
// Resolves once `setPersistence` settles; sign-in awaits it so the session is
// stored under browserLocalPersistence before the popup opens.
let persistenceReady: Promise<unknown> | null = null;

/** Idempotent singleton init: `initializeApp` + Auth + local persistence. */
export function initWebAuth(config: {
  apiKey: string;
  authDomain: string;
  projectId: string;
}): void {
  if (authInstance) return;
  const app = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
  });
  authInstance = createAuth(app);
  persistenceReady = setPersistence(authInstance, browserLocalPersistence);
}

// `getAuth` installs the popup/redirect resolver, which on iOS loads Google's
// gapi iframe script at startup. gapi refuses the native shell's `capacitor:`
// origin and throws from its cross-origin script, so every app launch reported
// two opaque "Script error." events. The native shell gets no resolver.
function createAuth(app: FirebaseApp): Auth {
  if (!osIsNativeMobile()) return getAuth(app);
  return initializeAuth(app, { persistence: browserLocalPersistence });
}

export function requireAuth(): Auth {
  if (!authInstance) {
    // Sign-in before `initWebAuth` is a wiring bug; surface it, don't swallow.
    throw new IdentityError("operation_not_allowed");
  }
  return authInstance;
}

export async function ready(): Promise<Auth> {
  const auth = requireAuth();
  if (persistenceReady) await persistenceReady;
  return auth;
}
