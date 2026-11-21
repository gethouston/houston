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
  baseUrl: () => string;
  fetch: typeof fetch;
  port: AccountLinkPort<S>;
  now?: () => number;
}

export interface IdentityModule {
  sendEmailCode(email: string): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<string>;
  beginAccountLink(pending: PendingLink): Promise<void>;
  resendAccountLinkCode(): Promise<void>;
  verifyAccountLinkCode(code: string): Promise<VerifyLinkOutcome>;
  cancelAccountLink(): void;
  abandonAccountLink(): void;
  sessionChanged(uid: string | null): void;
  getAccountLink(): AccountLinkView;
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
