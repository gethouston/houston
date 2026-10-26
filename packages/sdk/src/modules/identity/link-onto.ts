import type { AccountLinkRefusal, LinkProvider } from "@houston/wire-types";
import { emailClaimOf, sameAddress } from "./email-rules";
import type {
  AccountLinkPort,
  AccountLinkView,
  IdentitySession,
  PendingLinkHandle,
  VerifyLinkOutcome,
} from "./types";

/** What the step after the inbox proof needs from the flow that owns it. */
export interface LinkStep<S extends IdentitySession> {
  port: AccountLinkPort<S>;
  pending: { provider: LinkProvider; email: string; handle: PendingLinkHandle };
  publish(view: AccountLinkView): void;
  /** End the flow refused, dropping the held credential. */
  refuse(refusal: AccountLinkRefusal): VerifyLinkOutcome;
  /** End the flow linked, dropping the held credential. */
  linked(): VerifyLinkOutcome;
}

/**
 * The inbox is proved: link the held credential onto `session`, the one the
 * email code just minted, and only when that session names the same address
 * the provider asserted. Identity Platform links onto any session regardless
 * of address, so this check is the whole takeover guard.
 */
export async function linkOnto<S extends IdentitySession>(
  step: LinkStep<S>,
  session: S,
): Promise<VerifyLinkOutcome> {
  const { port, pending } = step;
  const { provider, email } = pending;
  const signOut = async () => {
    try {
      await port.signOutProvisional(session);
    } catch (error) {
      port.report({ severity: "error", reason: "link_failed", cause: error });
    }
  };

  if (!sameAddress(emailClaimOf(session.idToken), email)) {
    port.report({
      severity: "error",
      reason: "link_email_mismatch",
      cause: new Error(
        `email-code session names another address than the ${provider} sign-in`,
      ),
    });
    await signOut();
    return step.refuse("link_email_mismatch");
  }
  step.publish({ status: "linking", provider, email });
  try {
    const attempt = await port.linkPending(pending.handle, session);
    if (attempt.kind === "identity_taken") {
      port.report({
        severity: "quiet",
        reason: "link_identity_taken",
        cause: new Error(`${provider} identity already belongs to an account`),
      });
      await port.establish(session, "email");
      return step.refuse("link_identity_taken");
    }
    if (attempt.kind === "expired") {
      await signOut();
      return step.refuse("link_expired");
    }
    if (attempt.session.uid !== session.uid)
      throw new Error(`${provider} link answered for another account`);
    await port.establish(attempt.session, provider);
    return step.linked();
  } catch (error) {
    port.report({ severity: "error", reason: "link_failed", cause: error });
    await signOut();
    return step.refuse("link_failed");
  }
}
