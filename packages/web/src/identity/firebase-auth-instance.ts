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
let persistenceReady: Promise<unknown> | null = null;

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

function createAuth(app: FirebaseApp): Auth {
  if (!osIsNativeMobile()) return getAuth(app);
  return initializeAuth(app, { persistence: browserLocalPersistence });
}

export function requireAuth(): Auth {
  if (!authInstance) {
    throw new IdentityError("operation_not_allowed");
  }
  return authInstance;
}

export async function ready(): Promise<Auth> {
  const auth = requireAuth();
  if (persistenceReady) await persistenceReady;
  return auth;
}
