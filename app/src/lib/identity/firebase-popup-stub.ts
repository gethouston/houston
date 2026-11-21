import type {
  LinkAttempt,
  PendingLink,
  PendingLinkHandle,
} from "@houston/sdk/identity";
import { IdentityError, type Session, type SignInOutcome } from "./index.ts";

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
