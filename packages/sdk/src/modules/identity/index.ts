/**
 * Identity module: the gateway's email-code pair and the account-exists flow
 * (a Google, Microsoft or Apple sign-in that met an existing account links
 * onto it after the person proves the inbox with an email code).
 *
 * It runs BEFORE sign-in, so unlike every other module it is not composed by
 * the `HoustonSdk` kernel, which a surface builds only once it holds a bearer.
 * A surface builds this one through the engine adapter with a fetch that
 * carries no bearer. Being off the kernel also keeps it off the command
 * dispatch path and the assistant catalog: the AI Manager acts as a signed-in
 * person and never signs anyone in or links their accounts.
 */

import { ScopeStore } from "../../store";
import { createAccountLink } from "./account-link";
import {
  type EmailOtpTransport,
  startEmailOtp,
  verifyEmailOtp,
} from "./email-otp";
import type {
  AccountLinkPort,
  AccountLinkView,
  IdentitySession,
  PendingLink,
  VerifyLinkOutcome,
} from "./types";

export { ACCOUNT_LINK_SCOPE, LINK_TTL_MS } from "./account-link";
export { EmailOtpError, type EmailOtpFailure } from "./email-otp";
export * from "./types";

export interface IdentityModuleDeps<S extends IdentitySession> {
  /** The gateway serving `/v1/auth/email-otp/*`, read per request. */
  baseUrl: () => string;
  /** A fetch that carries no bearer: the person is not signed in yet. */
  fetch: typeof fetch;
  port: AccountLinkPort<S>;
  now?: () => number;
}

export interface IdentityModule {
  /** Mail a 6-digit sign-in code to `email`. Throws {@link EmailOtpError}. */
  sendEmailCode(email: string): Promise<void>;
  /** Trade a code for an Identity Platform custom token. Throws {@link EmailOtpError}. */
  verifyEmailCode(email: string, code: string): Promise<string>;
  /** Start the account-exists flow for a provider sign-in that met an account. */
  beginAccountLink(pending: PendingLink): Promise<void>;
  resendAccountLinkCode(): Promise<void>;
  /** Prove the inbox with `code`, then link the held provider sign-in. */
  verifyAccountLinkCode(code: string): Promise<VerifyLinkOutcome>;
  /** Drop the held provider sign-in and return to the sign-in screen. */
  cancelAccountLink(): void;
  /** The person signed out: end an unfinished link, whatever step it is on,
   *  so it neither signs them back in nor signs out the next session. */
  abandonAccountLink(): void;
  /** The platform's signed-in uid changed, from this tab or another. A link
   *  whose session is gone or replaced ends as if the person signed out. */
  sessionChanged(uid: string | null): void;
  getAccountLink(): AccountLinkView;
  /** The `accountLink` scope, in the shape `useSdkSnapshot` reads. */
  subscribe(scope: string, cb: (snapshot: unknown) => void): () => void;
  getSnapshot(scope: string): unknown | undefined;
}

export function createIdentityModule<S extends IdentitySession>(
  deps: IdentityModuleDeps<S>,
): IdentityModule {
  const transport: EmailOtpTransport = {
    baseUrl: deps.baseUrl,
    fetch: deps.fetch,
  };
  const store = new ScopeStore();
  const link = createAccountLink({
    transport,
    port: deps.port,
    store,
    now: deps.now ?? (() => Date.now()),
  });
  return {
    sendEmailCode: (email) => startEmailOtp(transport, email),
    verifyEmailCode: (email, code) => verifyEmailOtp(transport, email, code),
    beginAccountLink: (pending) => link.begin(pending),
    resendAccountLinkCode: () => link.resend(),
    verifyAccountLinkCode: (code) => link.verify(code),
    cancelAccountLink: () => link.cancel(),
    abandonAccountLink: () => link.abandon(),
    sessionChanged: (uid) => link.sessionChanged(uid),
    getAccountLink: () => link.view(),
    subscribe: (scope, cb) => store.subscribe(scope, cb),
    getSnapshot: (scope) => store.getSnapshot(scope),
  };
}
