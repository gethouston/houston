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

export interface LinkStep<S extends IdentitySession> {
  port: AccountLinkPort<S>;
  pending: {
    provider: LinkProvider;
    email: string;
    handle: PendingLinkHandle;
    accountId: string | null;
  };
  live(): boolean;
  publish(view: AccountLinkView): void;
  refuse(refusal: AccountLinkRefusal): VerifyLinkOutcome;
  linked(): VerifyLinkOutcome;
}

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
  const refuseSignedOut = async (refusal: AccountLinkRefusal) => {
    const outcome = step.refuse(refusal);
    await signOut();
    return outcome;
  };

  if (!step.live()) {
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
