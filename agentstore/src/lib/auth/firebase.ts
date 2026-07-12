/**
 * Firebase app + Auth bootstrap for the Agent Store. The store signs users in
 * with the SAME Google Cloud Identity Platform (Firebase Auth) project the
 * gateway verifies against, so the ID token this yields is accepted by the
 * gateway's GCIP verifier chain as `Principal.UserID` (the Firebase UID).
 *
 * Config comes from build-time-inlined `NEXT_PUBLIC_FIREBASE_*` vars. When they
 * are absent the store still builds and renders — `firebaseConfig()` returns null
 * and the session layer reports an unconfigured state instead of crashing — so a
 * preview/CI build with no auth secrets is valid.
 *
 * The `Auth` instance is a lazily-created singleton (Fast Refresh / repeated
 * imports must not re-`initializeApp`).
 */
import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";

/** The three Firebase web-config values the store needs for GCIP sign-in. */
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
}

/** Read the inlined Firebase web config, or null when any value is missing. */
export function firebaseConfig(): FirebaseConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!apiKey || !authDomain || !projectId) return null;
  return { apiKey, authDomain, projectId };
}

/** True when the store is provisioned for sign-in. */
export function isAuthConfigured(): boolean {
  return firebaseConfig() !== null;
}

let cachedAuth: Auth | null = null;

/**
 * The shared `Auth` instance, created on first use. Throws when the store is not
 * configured for auth — callers gate on `isAuthConfigured()` first (the session
 * provider does), so this only fires on a real misconfiguration.
 */
export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  const config = firebaseConfig();
  if (!config) {
    throw new Error(
      "Firebase auth is not configured (NEXT_PUBLIC_FIREBASE_*).",
    );
  }
  const app: FirebaseApp = getApps()[0] ?? initializeApp(config);
  cachedAuth = getAuth(app);
  return cachedAuth;
}
