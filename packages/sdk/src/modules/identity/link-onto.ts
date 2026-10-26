import type { AccountLinkRefusal, LinkProvider } from "@houston/wire-types";
import { emailClaimOf, sameAddress } from "./email-rules";
import type {
  AccountLinkPort,
  AccountLinkView,
  IdentitySession,
  LinkAttempt,
  MintedSession,
  PendingLinkHandle,
  VerifyLinkOutcome,
} from "./types";

/** What the step after the inbox proof needs from the flow that owns it. */
export interface LinkStep<S extends IdentitySession> {
  port: AccountLinkPort<S>;
  pending: {
    provider: LinkProvider;
    email: string;
    handle: PendingLinkHandle;
    accountId: string | null;
  };
  /** False once the flow ended elsewhere (the person signed out): from then
   *  on the step establishes nothing and signs nothing out. */
  live(): boolean;
  publish(view: AccountLinkView): void;
  /** End the flow refused, dropping the held credential. */
  refuse(refusal: AccountLinkRefusal): VerifyLinkOutcome;
  /** End the flow linked, dropping the held credential. */
  linked(): VerifyLinkOutcome;
}

/**
 * The inbox is proved: link the held credential onto the session the email
 * code just minted, and only when that session names the address the
 * provider asserted and is the account Identity Platform said holds it.
 * Identity Platform links onto any session regardless, so these checks are
 * the whole takeover guard.
 */
export async function linkOnto<S extends IdentitySession>(
  step: LinkStep<S>,
  minted: MintedSession<S>,
): Promise<VerifyLinkOutcome> {
  const { port, pending } = step;
  const { provider, email, accountId } = pending;
  const { session } = minted;
  const unexpected = (reason: AccountLinkRefusal, cause: unknown) =>
    port.report({ quiet: null, reason, cause });
  const signOut = async () => {
    try {
      await port.signOutProvisional(session);
    } catch (error) {
      unexpected("link_failed", error);
    }
  };
  // The flow ends before its session does: the web sign-out this runs is the
  // flow's own cleanup, so it must not read as the person leaving.
  const refuseSignedOut = async (refusal: AccountLinkRefusal) => {
    const outcome = step.refuse(refusal);
    await signOut();
    return outcome;
  };

  if (!step.live()) {
    // The person left while the code was checked: the session it minted
    // after that is nobody's to keep.
    await signOut();
    return notWaiting;
  }
  if (!sameAddress(emailClaimOf(session.idToken), email)) {
    unexpected(
      "link_email_mismatch",
      new Error(`email-code session names another address than ${provider}`),
    );
    return refuseSignedOut("link_email_mismatch");
  }
  if (minted.isNewUser || (accountId !== null && session.uid !== accountId)) {
    unexpected(
      "link_wrong_account",
      new Error(
        `email code signed in to ${minted.isNewUser ? "a new" : "another"} account than ${provider} met`,
      ),
    );
    return refuseSignedOut("link_wrong_account");
  }
  step.publish({ status: "linking", provider, email });
  let attempt: LinkAttempt<S>;
  try {
    attempt = await port.linkPending(pending.handle, session);
    if (attempt.kind === "linked" && attempt.session.uid !== session.uid)
      throw new Error(`${provider} link answered for another account`);
  } catch (error) {
    unexpected("link_failed", error);
    return step.live() ? refuseSignedOut("link_failed") : notWaiting;
  }
  if (!step.live()) return notWaiting;
  if (attempt.kind === "expired") return refuseSignedOut("link_expired");
  try {
    if (attempt.kind === "linked") {
      await port.establish(attempt.session, provider);
      return step.linked();
    }
    port.report({
      quiet: "link_identity_taken",
      reason: "link_identity_taken",
      cause: new Error(`${provider} identity already belongs to an account`),
    });
    await port.establish(session, "email");
    return step.refuse("link_identity_taken");
  } catch (error) {
    unexpected("link_failed", error);
    return refuseSignedOut("link_failed");
  }
}

const notWaiting: VerifyLinkOutcome = { kind: "not_waiting" };
