import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  type BrokeredLoopbackDeps,
  runBrokeredLoopbackAuthorize,
} from "../src/lib/identity/brokered-loopback.ts";
import { IdentityError } from "../src/lib/identity/errors.ts";
import { cancelPendingAuthorize } from "../src/lib/identity/oauth-attempt.ts";

// The GCIP-brokered loopback driver is pure (every effect injected), so the
// port-stepping, supersession, and requestUri-assembly contracts are unit-
// tested here; the real mint/bind/listen wiring is microsoft-authorize.ts.

afterEach(() => cancelPendingAuthorize("test cleanup"));

/** A deps bundle whose flow succeeds on the first port with `query`. */
function happyDeps(query: string): BrokeredLoopbackDeps & {
  minted: string[];
  released: Array<{ attemptId: number; why: string }>;
} {
  const minted: string[] = [];
  const released: Array<{ attemptId: number; why: string }> = [];
  return {
    minted,
    released,
    mint: async (continueUri) => {
      minted.push(continueUri);
      return {
        authUri: `https://login.example.com/authorize?state=gcip-state-${minted.length}`,
        sessionId: `session-${minted.length}`,
      };
    },
    startLoopback: async () => ({
      status: "listening",
      redirectUri: "http://127.0.0.1:8975/auth/callback",
      port: 8975,
      attemptId: 7,
    }),
    releaseLoopback: (attemptId, why) => released.push({ attemptId, why }),
    listen: async (onPayload) => {
      // Deliver the provider callback as soon as the attempt subscribes.
      queueMicrotask(() => onPayload(`houston://auth-callback?${query}`));
      return () => {};
    },
    openUrl: async () => {},
  };
}

test("assembles requestUri from the minted continueUri and the callback query", async () => {
  const deps = happyDeps("code=abc123&state=gcip-state-1");
  const result = await runBrokeredLoopbackAuthorize(deps);
  assert.deepEqual(result, {
    requestUri:
      "http://localhost:8975/auth/callback?code=abc123&state=gcip-state-1",
    sessionId: "session-1",
  });
  // The continueUri is the localhost spelling (Azure Web platform), port first
  // candidate, minted exactly once.
  assert.deepEqual(deps.minted, ["http://localhost:8975/auth/callback"]);
});

test("steps to the next candidate port and re-mints when a port is busy", async () => {
  const deps = happyDeps("code=abc123&state=gcip-state-2");
  let calls = 0;
  const ports: number[] = [];
  deps.startLoopback = async (_state, exactPort) => {
    ports.push(exactPort);
    calls += 1;
    if (calls === 1) return { status: "portBusy" };
    return {
      status: "listening",
      redirectUri: "http://127.0.0.1:8976/auth/callback",
      port: 8976,
      attemptId: 8,
    };
  };
  const result = await runBrokeredLoopbackAuthorize(deps);
  // A fresh authorize URL (and GCIP session) is minted for the SECOND port —
  // the first mint is tied to the busy port and must not be reused.
  assert.deepEqual(deps.minted, [
    "http://localhost:8975/auth/callback",
    "http://localhost:8976/auth/callback",
  ]);
  assert.deepEqual(ports, [8975, 8976]);
  assert.equal(result?.sessionId, "session-2");
  assert.equal(
    result?.requestUri,
    "http://localhost:8976/auth/callback?code=abc123&state=gcip-state-2",
  );
});

test("every candidate port busy is a typed failure, not a silent hang", async () => {
  const deps = happyDeps("unused");
  deps.startLoopback = async () => ({ status: "portBusy" });
  await assert.rejects(
    () => runBrokeredLoopbackAuthorize(deps),
    (e: unknown) =>
      e instanceof IdentityError &&
      e.code === "unknown" &&
      e.rawCode === "loopback_ports_exhausted",
  );
  // One mint per candidate: 8975..8978.
  assert.equal(deps.minted.length, 4);
});

test("supersession by a newer click resolves null (benign, no error)", async () => {
  const deps = happyDeps("unused");
  deps.startLoopback = async () => ({ status: "superseded" });
  assert.equal(await runBrokeredLoopbackAuthorize(deps), null);
});

test("an authorize URL without GCIP's state refuses to open a browser", async () => {
  const deps = happyDeps("unused");
  deps.mint = async () => ({
    authUri: "https://login.example.com/authorize?client_id=x",
    sessionId: "s",
  });
  let opened = 0;
  deps.openUrl = async () => {
    opened += 1;
  };
  await assert.rejects(
    () => runBrokeredLoopbackAuthorize(deps),
    (e: unknown) =>
      e instanceof IdentityError &&
      e.code === "malformed_response" &&
      e.rawCode === "auth_uri_missing_state",
  );
  assert.equal(opened, 0, "must not open a browser it cannot CSRF-match");
});

test("a provider error on the callback rejects typed", async () => {
  const deps = happyDeps(
    "error=access_denied&error_description=denied&state=gcip-state-1",
  );
  await assert.rejects(
    () => runBrokeredLoopbackAuthorize(deps),
    (e: unknown) =>
      e instanceof IdentityError && e.code === "invalid_idp_response",
  );
});

test("an external cancel resolves null and frees the bound port", async () => {
  const deps = happyDeps("unused");
  deps.listen = async () => () => {}; // never delivers a callback
  const pending = runBrokeredLoopbackAuthorize(deps);
  // Let the attempt subscribe + open the browser before cancelling.
  await new Promise((r) => setTimeout(r, 10));
  cancelPendingAuthorize("sign-in screen unmounted");
  assert.equal(await pending, null);
  assert.deepEqual(deps.released, [{ attemptId: 7, why: "attempt abandoned" }]);
});
