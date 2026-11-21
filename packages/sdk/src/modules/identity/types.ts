import type {
  AccountLinkRefusal,
  EmailOtpRefusal,
  LinkProvider,
  LinkRequired,
} from "@houston/wire-types";
import type { QuietErrorClass } from "../../quiet-error-class";

export type PendingLinkHandle = string & {
  readonly __pendingLinkHandle: true;
};

export function newPendingLinkHandle(): PendingLinkHandle {
  return crypto.randomUUID() as PendingLinkHandle;
}

export interface PendingLink extends LinkRequired {
  handle: PendingLinkHandle;
  accountId: string | null;
}

export interface IdentitySession {
  uid: string;
  idToken: string;
}

export interface MintedSession<S> {
  session: S;
  isNewUser: boolean;
}

export type LinkAttempt<S> =
  | { kind: "linked"; session: S }
  | { kind: "identity_taken" }
  | { kind: "expired" };

export interface AccountLinkProblem {
  quiet: Extract<QuietErrorClass, "offline" | "link_identity_taken"> | null;
  reason: AccountLinkRefusal | "email_code_failed";
  cause: unknown;
}

export interface AccountLinkPort<S extends IdentitySession> {
  signInWithCustomToken(customToken: string): Promise<MintedSession<S>>;
  linkPending(handle: PendingLinkHandle, session: S): Promise<LinkAttempt<S>>;
  discardPending(handle: PendingLinkHandle): void;
  signOutProvisional(session: S): Promise<void>;
  establish(session: S, method: LinkProvider | "email"): Promise<void>;
  report(problem: AccountLinkProblem): void;
}

export type AccountLinkCodeError = EmailOtpRefusal | "network" | "unknown";

export type AccountLinkView =
  | { status: "idle" }
  | {
      status: "sending_code" | "verifying" | "linking" | "linked";
      provider: LinkProvider;
      email: string;
    }
  | {
      status: "needs_code";
      provider: LinkProvider;
      email: string;
      codeError: AccountLinkCodeError | null;
    }
  | {
      status: "refused";
      provider: LinkProvider;
      email: string | null;
      refusal: AccountLinkRefusal;
    };

export type AccountLinkStatus = AccountLinkView["status"];

export type VerifyLinkOutcome =
  | { kind: "linked" }
  | { kind: "code_rejected"; error: AccountLinkCodeError }
  | { kind: "refused"; refusal: AccountLinkRefusal }
  | { kind: "not_waiting" };
