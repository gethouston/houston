import type {
  AccountLinkRefusal,
  EmailOtpRefusal,
  LinkProvider,
  LinkRequired,
} from "@houston/wire-types";
import type { QuietErrorClass } from "../../quiet-error-class";

/**
 * The platform's in-memory reference to a held provider credential. The SDK
 * passes it back and never sees the credential itself, so no snapshot, log or
 * analytics call can carry one.
 */
export type PendingLinkHandle = string & {
  readonly __pendingLinkHandle: true;
};

/** Mint a fresh handle for a credential a platform is about to hold. */
export function newPendingLinkHandle(): PendingLinkHandle {
  return crypto.randomUUID() as PendingLinkHandle;
}

/** A provider sign-in that met an existing account, with its held credential. */
export interface PendingLink extends LinkRequired {
  handle: PendingLinkHandle;
  /** The uid Identity Platform named as the address's owner, when it named one. */
  accountId: string | null;
}

/** The two fields the SDK reads from a session the flow minted. */
export interface IdentitySession {
  uid: string;
  /** The Identity Platform ID token. Its `email` claim is the proved inbox. */
  idToken: string;
}

/** A session the gateway's custom token signed in to. */
export interface MintedSession<S> {
  session: S;
  /** This sign-in created the account, so it is not the one that exists. */
  isNewUser: boolean;
}

/** What linking the held credential onto a session came to. A provider that
 *  refuses the credential is a failure, so the port throws. */
export type LinkAttempt<S> =
  | { kind: "linked"; session: S }
  /** The provider identity already belongs to an account. */
  | { kind: "identity_taken" }
  /** The platform no longer holds the credential: it was discarded. */
  | { kind: "expired" };

/** A stopped link, for the error reporting paths. */
export interface AccountLinkProblem {
  /** The quiet class an expected state counts under, once per burst. Null
   *  for a failure to triage. */
  quiet: Extract<QuietErrorClass, "offline" | "link_identity_taken"> | null;
  reason: AccountLinkRefusal | "email_code_failed";
  cause: unknown;
}

/**
 * The platform half of the flow: Identity Platform calls and the app's session
 * lifecycle, which differ between the desktop REST client and firebase-js-sdk.
 * Every method translates; none decides.
 */
export interface AccountLinkPort<S extends IdentitySession> {
  /**
   * Exchange the gateway's custom token for a session. Not yet the app's.
   * Rejects with an `EmailOtpError` for a failure the person can act on
   * (`network`, `otp_account_disabled`); any other rejection is unexpected.
   */
  signInWithCustomToken(customToken: string): Promise<MintedSession<S>>;
  /** Link the held credential onto `session`, the one this flow minted. */
  linkPending(handle: PendingLinkHandle, session: S): Promise<LinkAttempt<S>>;
  /** Drop the held credential. */
  discardPending(handle: PendingLinkHandle): void;
  /** Undo a minted session that must not stay signed in. A session that has
   *  replaced it since stays. */
  signOutProvisional(session: S): Promise<void>;
  /** Make `session` the app's signed-in session, through the normal path. */
  establish(session: S, method: LinkProvider | "email"): Promise<void>;
  report(problem: AccountLinkProblem): void;
}

/** Why an entered code did not sign in. */
export type AccountLinkCodeError = EmailOtpRefusal | "network" | "unknown";

/** The `accountLink` snapshot: plain JSON, never a token or credential. */
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

/** What one code entry came to. The snapshot says the same, for rendering. */
export type VerifyLinkOutcome =
  | { kind: "linked" }
  | { kind: "code_rejected"; error: AccountLinkCodeError }
  | { kind: "refused"; refusal: AccountLinkRefusal }
  /** No code was awaited, or the flow ended while this one was checked:
   *  cancelled, signed out, restarted, or already verifying. */
  | { kind: "not_waiting" };
