import type { AccountLinkRefusal } from "@houston/wire-types";
import type { ScopeStore } from "../../store";
import {
  EmailOtpError,
  type EmailOtpTransport,
  startEmailOtp,
  verifyEmailOtp,
} from "./email-otp";
import { normalizeAddress } from "./email-rules";
import { linkOnto } from "./link-onto";
import type {
  AccountLinkCodeError,
  AccountLinkPort,
  AccountLinkView,
  IdentitySession,
  PendingLink,
  VerifyLinkOutcome,
} from "./types";

export const ACCOUNT_LINK_SCOPE = "accountLink";

/** A held provider sign-in older than this restarts instead of linking. */
export const LINK_TTL_MS = 10 * 60_000;

interface Flow {
  pending: PendingLink & { email: string };
  startedAt: number;
}

function codeErrorOf(error: unknown): AccountLinkCodeError {
  if (!(error instanceof EmailOtpError)) return "unknown";
  return error.code === "malformed_response" ? "unknown" : error.code;
}

/**
 * The account-exists flow: a provider sign-in met an existing account, so the
 * person proves the inbox with an email code and the held credential is
 * linked onto the session that code minted. The flow never links any other
 * session, and the credential never leaves the platform port.
 */
export function createAccountLink<S extends IdentitySession>(deps: {
  transport: EmailOtpTransport;
  port: AccountLinkPort<S>;
  store: ScopeStore;
  now: () => number;
}) {
  const { transport, port, store, now } = deps;
  let flow: Flow | null = null;
  let view: AccountLinkView = { status: "idle" };

  const publish = (next: AccountLinkView): void => {
    view = next;
    store.publish(ACCOUNT_LINK_SCOPE, next);
  };
  publish(view);

  const busy = () => view.status === "verifying" || view.status === "linking";

  function end(f: Flow, next: AccountLinkView): void {
    port.discardPending(f.pending.handle);
    if (flow === f) flow = null;
    publish(next);
  }

  function refuse(f: Flow, refusal: AccountLinkRefusal): VerifyLinkOutcome {
    const { provider, email } = f.pending;
    end(f, { status: "refused", provider, email, refusal });
    return { kind: "refused", refusal };
  }

  async function sendCode(f: Flow): Promise<void> {
    const { provider, email } = f.pending;
    publish({ status: "sending_code", provider, email });
    let codeError: AccountLinkCodeError | null = null;
    try {
      await startEmailOtp(transport, email);
    } catch (error) {
      codeError = codeErrorOf(error);
      if (codeError === "unknown")
        port.report({
          severity: "error",
          reason: "email_code_failed",
          cause: error,
        });
    }
    if (flow === f)
      publish({ status: "needs_code", provider, email, codeError });
  }

  function rejectCode(f: Flow, error: unknown): VerifyLinkOutcome {
    const codeError = codeErrorOf(error);
    if (codeError === "unknown")
      port.report({
        severity: "error",
        reason: "email_code_failed",
        cause: error,
      });
    const { provider, email } = f.pending;
    publish({ status: "needs_code", provider, email, codeError });
    return { kind: "code_rejected", error: codeError };
  }

  return {
    /** Hold a provider sign-in that met an existing account and mail a code
     *  to its address. A pending link that is not mid-verify is replaced. */
    async begin(pending: PendingLink): Promise<void> {
      if (busy()) {
        port.discardPending(pending.handle);
        return;
      }
      if (flow) port.discardPending(flow.pending.handle);
      flow = null;
      const email = normalizeAddress(pending.email ?? "");
      if (!email) {
        port.discardPending(pending.handle);
        const { provider } = pending;
        publish({
          status: "refused",
          provider,
          email: null,
          refusal: "link_email_unknown",
        });
        return;
      }
      const f: Flow = { pending: { ...pending, email }, startedAt: now() };
      flow = f;
      await sendCode(f);
    },

    async resend(): Promise<void> {
      const f = flow;
      if (!f || view.status !== "needs_code") return;
      if (now() - f.startedAt > LINK_TTL_MS) refuse(f, "link_expired");
      else await sendCode(f);
    },

    async verify(code: string): Promise<VerifyLinkOutcome> {
      const f = flow;
      if (!f || view.status !== "needs_code") return { kind: "not_waiting" };
      if (now() - f.startedAt > LINK_TTL_MS) return refuse(f, "link_expired");
      const { provider, email } = f.pending;
      publish({ status: "verifying", provider, email });
      let session: S;
      try {
        const customToken = await verifyEmailOtp(transport, email, code.trim());
        session = await port.signInWithCustomToken(customToken);
      } catch (error) {
        return rejectCode(f, error);
      }
      return linkOnto(
        {
          port,
          pending: f.pending,
          publish,
          refuse: (refusal) => refuse(f, refusal),
          linked: () => {
            end(f, { status: "linked", provider, email });
            return { kind: "linked" };
          },
        },
        session,
      );
    },

    /** Back to the sign-in screen. A code already sent stays valid on the
     *  gateway; a verify or link in flight finishes first. */
    cancel(): void {
      if (busy()) return;
      if (flow) port.discardPending(flow.pending.handle);
      flow = null;
      publish({ status: "idle" });
    },

    view: (): AccountLinkView => view,
  };
}
