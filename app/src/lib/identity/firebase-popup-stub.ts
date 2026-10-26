// Desktop stub for the web-only Firebase Auth surface.
//
// The desktop bundle resolves `@houston/web-identity` to THIS module (Vite alias
// in app/vite.config.ts) so firebase-js-sdk never ships to desktop. Desktop
// sign-in goes through the REST + loopback path instead; the web module
// (packages/web/src/identity/firebase-popup.ts) is its counterpart. Every symbol
// here mirrors that module's signature but throws `operation_not_allowed` — none
// is ever called on desktop (the flows are `osIsTauri()`-guarded in auth.ts).

import type {
  LinkAttempt,
  PendingLink,
  PendingLinkHandle,
} from "@houston/sdk/identity";
import { IdentityError, type Session, type SignInOutcome } from "./index.ts";

// A firebase-free structural view of the fields `toSession` reads from a
// Firebase user. The desktop bundle has no firebase types, so the seam's
// signature is expressed structurally; a real Firebase `User` satisfies it.
interface FirebaseUserLike {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  refreshToken: string;
  providerData: readonly { providerId: string }[];
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

function notOnDesktop(): never {
  throw new IdentityError("operation_not_allowed");
}

export function initWebAuth(_config: {
  apiKey: string;
  authDomain: string;
  projectId: string;
}): void {
  notOnDesktop();
}

export function webSignInWithGoogle(): Promise<
  SignInOutcome | PendingLink | null
> {
  return notOnDesktop();
}

export function webSignInWithMicrosoft(): Promise<
  SignInOutcome | PendingLink | null
> {
  return notOnDesktop();
}

export function webSignInWithApple(): Promise<
  SignInOutcome | PendingLink | null
> {
  return notOnDesktop();
}

export function webSignInWithCustomToken(
  _token: string,
): Promise<SignInOutcome | null> {
  return notOnDesktop();
}

export function webLinkPending(
  _handle: PendingLinkHandle,
  _session: Session,
): Promise<LinkAttempt<Session>> {
  return notOnDesktop();
}

export function webDiscardPending(_handle: PendingLinkHandle): void {
  notOnDesktop();
}

export function webSignOut(): Promise<void> {
  return notOnDesktop();
}

export function webOnIdTokenChanged(
  _cb: (session: Session | null) => void,
): () => void {
  return notOnDesktop();
}

export function webCurrentUid(): string | null {
  return notOnDesktop();
}

export function webRefreshIdToken(): Promise<string | null> {
  return notOnDesktop();
}

export function webCurrentSession(): Promise<Session | null> {
  return notOnDesktop();
}

export function toSession(_user: FirebaseUserLike): Promise<Session> {
  return notOnDesktop();
}
