import type { LinkProvider } from "@houston/wire-types";
import { createIdentityModule } from "./index";
import {
  type AccountLinkProblem,
  type IdentitySession,
  type LinkAttempt,
  newPendingLinkHandle,
  type PendingLink,
  type PendingLinkHandle,
} from "./types";

export const GATEWAY = "https://gw.test";
export const GOOD_CODE = "123456";

/** An unsigned JWT whose payload carries `claims`. */
function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${part({ alg: "none" })}.${part(claims)}.`;
}

export interface TestSession extends IdentitySession {
  label: string;
}

type Answer = number | "network";
type Attempt = (
  session: TestSession,
) => LinkAttempt<TestSession> | Promise<LinkAttempt<TestSession>>;

/**
 * A gateway that mails codes and mints a custom token naming the address the
 * code was verified for, plus a platform port that records every call. The
 * session a custom token signs in to is `uid-a` naming `sessionEmail` (the
 * gateway's account for that address), so a test can model a server that
 * resolves an address to a different account.
 */
export function identityKit(
  opts: {
    sessionEmail?: string;
    sessionUid?: string;
    isNewUser?: boolean;
  } = {},
) {
  const requests: { url: string; body: unknown }[] = [];
  let clock = 1_000_000;
  let start: Answer = 204;
  let verify: { answer: Answer; body: string } | null = null;
  let mintFailure: unknown = null;
  let mintHold: { entered: () => void; gate: Promise<void> } | null = null;
  let onSignOut = () => {};
  let attempt: Attempt = (s) => ({
    kind: "linked",
    session: { ...s, idToken: `${s.idToken}+linked`, label: "linked" },
  });
  const calls = {
    minted: [] as TestSession[],
    linked: [] as { handle: PendingLinkHandle; session: TestSession }[],
    discarded: [] as PendingLinkHandle[],
    signedOut: [] as TestSession[],
    established: [] as {
      session: TestSession;
      method: LinkProvider | "email";
    }[],
    reported: [] as AccountLinkProblem[],
  };

  const fetch = (async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    requests.push({ url: String(url), body });
    const answer = String(url).endsWith("/start") ? start : verify?.answer;
    if (answer === "network") throw new TypeError("Failed to fetch");
    if (String(url).endsWith("/start"))
      return new Response(null, { status: answer });
    if (answer) return new Response(verify?.body, { status: answer });
    if (body.code !== GOOD_CODE) return new Response("", { status: 401 });
    return Response.json({ customToken: `custom-token:${body.email}` });
  }) as typeof globalThis.fetch;

  const identity = createIdentityModule<TestSession>({
    baseUrl: () => `${GATEWAY}/`,
    fetch,
    now: () => clock,
    port: {
      async signInWithCustomToken(customToken) {
        if (mintHold) {
          mintHold.entered();
          await mintHold.gate;
        }
        if (mintFailure) throw mintFailure;
        const address = opts.sessionEmail ?? customToken.split(":")[1];
        const session = {
          uid: opts.sessionUid ?? "uid-a",
          idToken: jwt({ email: address }),
          label: "minted",
        };
        calls.minted.push(session);
        return { session, isNewUser: opts.isNewUser ?? false };
      },
      async linkPending(handle, session) {
        calls.linked.push({ handle, session });
        return attempt(session);
      },
      discardPending: (handle) => calls.discarded.push(handle),
      async signOutProvisional(session) {
        calls.signedOut.push(session);
        onSignOut();
      },
      async establish(session, method) {
        calls.established.push({ session, method });
      },
      report: (problem) => calls.reported.push(problem),
    },
  });

  return {
    identity,
    requests,
    calls,
    pending(
      provider: LinkProvider,
      email: string | null,
      accountId: string | null = "uid-a",
    ): PendingLink {
      return {
        kind: "link_required",
        provider,
        email,
        handle: newPendingLinkHandle(),
        accountId,
      };
    },
    /** `[quiet class or "error", reason]` for every report, in order. */
    reports: () =>
      calls.reported.map((r) => [r.quiet ?? "error", r.reason] as const),
    advance: (ms: number) => {
      clock += ms;
    },
    answerStart: (answer: Answer) => {
      start = answer;
    },
    answerVerify: (answer: Answer, body = "") => {
      verify = { answer, body };
    },
    mintFails: (error: unknown) => {
      mintFailure = error;
    },
    /** Hold the custom-token exchange until `release`; `entered` resolves
     *  once the flow is waiting on it. */
    holdMint() {
      let entered!: () => void;
      let release!: () => void;
      const reached = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      mintHold = { entered, gate };
      return { entered: reached, release };
    },
    whenSignedOut: (fn: () => void) => {
      onSignOut = fn;
    },
    linkAnswers: (next: Attempt) => {
      attempt = next;
    },
  };
}

/** A link answer the test settles once the person has left. */
type LinkAnswer = (session: TestSession) => LinkAttempt<TestSession>;

/** A link request held in flight until the test settles it. */
export function deferredLink() {
  let settle!: (answer: LinkAnswer) => void;
  let started!: () => void;
  const inFlight = new Promise<void>((resolve) => {
    started = resolve;
  });
  const answer = new Promise<LinkAnswer>((resolve) => {
    settle = resolve;
  });
  return {
    inFlight,
    settle,
    attempt: async (session: TestSession) => {
      started();
      return (await answer)(session);
    },
  };
}
