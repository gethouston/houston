import type { AccountLinkRefusal } from "@houston/wire-types";
import type { ScopeStore } from "../../store";
import {
  codeErrorOf,
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
  MintedSession,
  PendingLink,
  VerifyLinkOutcome,
} from "./types";

export const ACCOUNT_LINK_SCOPE = "accountLink";

/** A held provider sign-in older than this restarts instead of linking. */
export const LINK_TTL_MS = 10 * 60_000;

interface Flow {
  pending: PendingLink & { email: string };
  startedAt: number;
  minted?: string;
}

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
    if (flow !== f) return;
    flow = null;
    publish(next);
  }

  function failCode(error: unknown): AccountLinkCodeError {
    const codeError = codeErrorOf(error);
    if (codeError === "network" || codeError === "unknown")
      port.report({
        quiet: codeError === "network" ? "offline" : null,
        reason: "email_code_failed",
        cause: error,
      });
    return codeError;
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
      codeError = failCode(error);
    }
    if (flow === f)
      publish({ status: "needs_code", provider, email, codeError });
  }

  function rejectCode(f: Flow, error: unknown): VerifyLinkOutcome {
    const codeError = failCode(error);
    if (flow !== f) return { kind: "not_waiting" };
    const { provider, email } = f.pending;
    publish({ status: "needs_code", provider, email, codeError });
    return { kind: "code_rejected", error: codeError };
  }

  function drop(): void {
    if (flow) port.discardPending(flow.pending.handle);
    flow = null;
  }

  function abandon(): void {
    if (!flow) return;
    drop();
    publish({ status: "idle" });
  }

  return {
    async begin(pending: PendingLink): Promise<void> {
      if (busy()) {
        port.discardPending(pending.handle);
        return;
      }
      drop();
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
      let minted: MintedSession<S>;
      try {
        const customToken = await verifyEmailOtp(transport, email, code.trim());
        minted = await port.signInWithCustomToken(customToken);
      } catch (error) {
        return rejectCode(f, error);
      }
      f.minted = minted.session.uid;
      return linkOnto(
        {
          port,
          pending: f.pending,
          live: () => flow === f,
          publish,
          refuse: (refusal) => refuse(f, refusal),
          linked: () => {
            end(f, { status: "linked", provider, email });
            return { kind: "linked" };
          },
        },
        minted,
      );
    },

    cancel(): void {
      drop();
      publish({ status: "idle" });
    },

    abandon,

    sessionChanged(uid: string | null): void {
      if (flow?.minted !== undefined && uid !== flow.minted) abandon();
    },

    view: (): AccountLinkView => view,
  };
}
