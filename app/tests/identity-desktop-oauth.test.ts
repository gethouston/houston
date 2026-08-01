import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  APPLE_RETURN_PATH,
  appleReturnUrl,
} from "../src/lib/identity/apple-return.ts";
import { IdentityError } from "../src/lib/identity/errors.ts";
import {
  awaitLoopbackCallback,
  cancelPendingAuthorize,
} from "../src/lib/identity/oauth-attempt.ts";
import {
  type DeepLinkListen,
  withBrowserOpenDeadline,
} from "../src/lib/identity/oauth-attempt-contract.ts";
import {
  parseCallbackQuery,
  parseCallbackUrl,
} from "../src/lib/identity/oauth-callback.ts";
import {
  base64UrlEncode,
  computeCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "../src/lib/identity/pkce.ts";

// The pure PKCE + callback-parsing logic is tested here directly; the loopback
// listener + token exchange in desktop-oauth.ts are Tauri/network-bound and are
// exercised end-to-end, not in the unit runner.

test("generateCodeVerifier yields a 43-char base64url string in range", () => {
  const v = generateCodeVerifier();
  assert.match(v, /^[A-Za-z0-9_-]+$/);
  assert.ok(v.length >= 43 && v.length <= 128, `length ${v.length}`);
});

test("computeCodeChallenge is base64url(SHA-256(verifier))", async () => {
  const verifier = generateCodeVerifier();
  const challenge = await computeCodeChallenge(verifier);
  // Recompute independently to confirm S256 + base64url encoding.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  assert.equal(challenge, base64UrlEncode(new Uint8Array(digest)));
  assert.match(challenge, /^[A-Za-z0-9_-]+$/);
  assert.ok(!challenge.includes("="));
});

test("computeCodeChallenge matches the RFC 7636 test vector", async () => {
  // RFC 7636 Appendix B.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  assert.equal(
    await computeCodeChallenge(verifier),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

test("generateState is random per call", () => {
  assert.notEqual(generateState(), generateState());
});

test("parseCallbackUrl returns the code when state matches", () => {
  const code = parseCallbackUrl(
    "houston://auth-callback?code=auth-code-123&state=st-1",
    "st-1",
  );
  assert.equal(code, "auth-code-123");
});

test("parseCallbackUrl throws on a CSRF state mismatch", () => {
  assert.throws(
    () =>
      parseCallbackUrl(
        "houston://auth-callback?code=auth-code-123&state=forged",
        "expected-state",
      ),
    (e: unknown) =>
      e instanceof IdentityError &&
      e.code === "invalid_idp_response" &&
      e.rawCode === "state_mismatch",
  );
});

test("parseCallbackUrl surfaces a provider error param as a typed throw", () => {
  assert.throws(
    () =>
      parseCallbackUrl(
        "houston://auth-callback?error=access_denied&state=st-1",
        "st-1",
      ),
    (e: unknown) =>
      e instanceof IdentityError &&
      e.code === "invalid_idp_response" &&
      e.rawCode === "access_denied",
  );
});

test("parseCallbackUrl throws when the code is missing", () => {
  assert.throws(
    () => parseCallbackUrl("houston://auth-callback?state=st-1", "st-1"),
    (e: unknown) => e instanceof IdentityError && e.rawCode === "missing_code",
  );
});

// ── awaitLoopbackCallback: supersession / cancel / timeout lifecycle ───────────
//
// The Tauri deep-link listener + system-browser open are injected, so the
// attempt-registry logic (supersede a pending attempt, cancel on unmount,
// benign timeout, typed reject on a genuine callback error, onBrowserOpened
// after the browser opens) is exercised without any Tauri/network dependency.

/** A fake deep-link listener the test drives to deliver (or withhold) a callback. */
function makeListen(): {
  listen: DeepLinkListen;
  emit: (payload: string) => void;
  unlistened: () => boolean;
} {
  let handler: ((payload: string) => void) | null = null;
  let torn = false;
  return {
    listen: (onPayload) => {
      handler = onPayload;
      return Promise.resolve(() => {
        torn = true;
      });
    },
    emit: (payload) => handler?.(payload),
    unlistened: () => torn,
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const openOk = () => Promise.resolve();

afterEach(() => {
  // Never leak a pending attempt into the next test.
  cancelPendingAuthorize("test teardown");
});

test("awaitLoopbackCallback resolves the code when the callback state matches", async () => {
  const l = makeListen();
  const p = awaitLoopbackCallback({
    expectedState: "st-1",
    authorizeUrl: "https://provider/authorize",
    listen: l.listen,
    openUrl: openOk,
  });
  await tick();
  l.emit("houston://auth-callback?code=good-code&state=st-1");
  assert.equal(await p, "good-code");
  assert.equal(l.unlistened(), true);
});

test("a second awaitLoopbackCallback supersedes the first (first resolves null, no rejection)", async () => {
  const first = makeListen();
  const p1 = awaitLoopbackCallback({
    expectedState: "s1",
    authorizeUrl: "https://provider/a",
    listen: first.listen,
    openUrl: openOk,
  });
  // Start a second attempt: it must cancel the first as a benign null.
  const second = makeListen();
  const p2 = awaitLoopbackCallback({
    expectedState: "s2",
    authorizeUrl: "https://provider/b",
    listen: second.listen,
    openUrl: openOk,
  });
  assert.equal(await p1, null); // benign cancel, not a rejection
  assert.equal(first.unlistened(), true); // first listener torn down
  // Drive the second to completion so nothing leaks.
  await tick();
  second.emit("houston://auth-callback?code=c2&state=s2");
  assert.equal(await p2, "c2");
});

test("cancelPendingAuthorize resolves the pending attempt with null", async () => {
  const l = makeListen();
  const p = awaitLoopbackCallback({
    expectedState: "s1",
    authorizeUrl: "https://provider/a",
    listen: l.listen,
    openUrl: openOk,
  });
  await tick();
  cancelPendingAuthorize("user left the screen");
  assert.equal(await p, null);
  assert.equal(l.unlistened(), true);
});

test("the timeout resolves null (benign), never a rejection", async () => {
  const l = makeListen();
  const p = awaitLoopbackCallback({
    expectedState: "s1",
    authorizeUrl: "https://provider/a",
    listen: l.listen,
    openUrl: openOk,
    timeoutMs: 5,
  });
  assert.equal(await p, null);
  assert.equal(l.unlistened(), true);
});

test("a mismatched-state callback is IGNORED (keeps waiting), not fatal", async () => {
  // A stale/foreign callback (another tab's or a rebound-port delivery) carries
  // a different `state`. It must NOT settle the legitimate attempt: the attempt
  // stays pending and the later correct-state callback resolves the real code.
  const l = makeListen();
  let settled = false;
  const p = awaitLoopbackCallback({
    expectedState: "expected",
    authorizeUrl: "https://provider/a",
    listen: l.listen,
    openUrl: openOk,
  }).then((v) => {
    settled = true;
    return v;
  });
  await tick();
  l.emit("houston://auth-callback?code=stale&state=forged"); // ignored
  await tick();
  assert.equal(settled, false); // still pending — the foreign callback was ignored
  assert.equal(l.unlistened(), false); // listener still live, awaiting the real one
  l.emit("houston://auth-callback?code=real-code&state=expected");
  assert.equal(await p, "real-code");
  assert.equal(l.unlistened(), true);
});

test("a genuine provider error (matching state) still rejects typed", async () => {
  const l = makeListen();
  const p = awaitLoopbackCallback({
    expectedState: "expected",
    authorizeUrl: "https://provider/a",
    listen: l.listen,
    openUrl: openOk,
  });
  await tick();
  l.emit("houston://auth-callback?error=access_denied&state=expected");
  await assert.rejects(
    p,
    (e: unknown) =>
      e instanceof IdentityError &&
      e.code === "invalid_idp_response" &&
      e.rawCode === "access_denied",
  );
});

test("an external cancel (sign-in-screen unmount) frees the loopback port", async () => {
  const l = makeListen();
  let freed = 0;
  const p = awaitLoopbackCallback({
    expectedState: "s1",
    authorizeUrl: "https://provider/a",
    listen: l.listen,
    openUrl: openOk,
    abandonLoopback: () => {
      freed += 1;
    },
  });
  await tick();
  cancelPendingAuthorize("user left the screen"); // freePort defaults to true
  assert.equal(await p, null);
  assert.equal(freed, 1); // the native port was freed immediately
});

test("supersession does NOT free the previous port (Rust already superseded it)", async () => {
  const first = makeListen();
  let firstFreed = 0;
  const p1 = awaitLoopbackCallback({
    expectedState: "s1",
    authorizeUrl: "https://provider/a",
    listen: first.listen,
    openUrl: openOk,
    abandonLoopback: () => {
      firstFreed += 1;
    },
  });
  // A second attempt supersedes the first. The first must resolve null WITHOUT
  // its port being freed here — the new attempt's start_oauth_loopback already
  // superseded the old listener, and a cancel here would race the new one.
  const second = makeListen();
  const p2 = awaitLoopbackCallback({
    expectedState: "s2",
    authorizeUrl: "https://provider/b",
    listen: second.listen,
    openUrl: openOk,
  });
  assert.equal(await p1, null);
  assert.equal(firstFreed, 0);
  await tick();
  second.emit("houston://auth-callback?code=c2&state=s2");
  assert.equal(await p2, "c2");
});

test("the timeout frees the loopback port", async () => {
  const l = makeListen();
  let freed = 0;
  const p = awaitLoopbackCallback({
    expectedState: "s1",
    authorizeUrl: "https://provider/a",
    listen: l.listen,
    openUrl: openOk,
    timeoutMs: 5,
    abandonLoopback: () => {
      freed += 1;
    },
  });
  assert.equal(await p, null);
  assert.equal(freed, 1);
});

test("onBrowserOpened fires after openUrl resolves", async () => {
  const l = makeListen();
  let opened = 0;
  const p = awaitLoopbackCallback({
    expectedState: "s1",
    authorizeUrl: "https://provider/a",
    listen: l.listen,
    openUrl: openOk,
    onBrowserOpened: () => {
      opened += 1;
    },
  });
  await tick();
  assert.equal(opened, 1);
  l.emit("houston://auth-callback?code=c&state=s1");
  await p;
});

// ── The PRE-browser deadline ──────────────────────────────────────────────────
//
// Until `onBrowserOpened` fires the sign-in buttons are latched and the user
// sees nothing at all, so a hang there (loopback bind, PKCE, the browser
// hand-off) must FAIL loudly rather than sit out the 300s callback timeout —
// that hang is what left the buttons dead until the app was quit.

test("a browser that never opens rejects typed and frees the loopback port", async () => {
  const l = makeListen();
  let freed = 0;
  const p = awaitLoopbackCallback({
    expectedState: "s1",
    authorizeUrl: "https://provider/a",
    listen: l.listen,
    openUrl: () => new Promise<void>(() => {}), // hangs forever
    browserOpenTimeoutMs: 5,
    abandonLoopback: () => {
      freed += 1;
    },
  });
  await assert.rejects(
    p,
    (e: unknown) =>
      e instanceof IdentityError &&
      e.code === "browser_open_timeout" &&
      e.rawCode === "open_url",
  );
  assert.equal(freed, 1, "the native port was not released");
  assert.equal(l.unlistened(), true);
});

test("the pre-browser deadline stops applying once the browser has opened", async () => {
  // Past the hand-off the user may legitimately take minutes: only the benign
  // callback timeout bounds the wait from then on.
  const l = makeListen();
  let settled = false;
  const p = awaitLoopbackCallback({
    expectedState: "s1",
    authorizeUrl: "https://provider/a",
    listen: l.listen,
    openUrl: openOk,
    browserOpenTimeoutMs: 5,
    timeoutMs: 5_000,
  }).then((v) => {
    settled = true;
    return v;
  });
  await new Promise((r) => setTimeout(r, 30)); // well past the open deadline
  assert.equal(settled, false, "the open deadline fired after the hand-off");
  l.emit("houston://auth-callback?code=late-but-fine&state=s1");
  assert.equal(await p, "late-but-fine");
});

test("withBrowserOpenDeadline passes a fast result through and times a slow one out", async () => {
  assert.equal(
    await withBrowserOpenDeadline(Promise.resolve("bound"), "loopback_bind", {
      ms: 50,
    }),
    "bound",
  );
  await assert.rejects(
    withBrowserOpenDeadline(new Promise<string>(() => {}), "loopback_bind", {
      ms: 5,
    }),
    (e: unknown) =>
      e instanceof IdentityError &&
      e.code === "browser_open_timeout" &&
      e.rawCode === "loopback_bind",
  );
  // A rejection of the underlying work still propagates unchanged.
  await assert.rejects(
    withBrowserOpenDeadline(
      Promise.reject(new Error("all ports busy")),
      "loopback_bind",
      { ms: 50 },
    ),
    /all ports busy/,
  );
});

test("a pre-browser step resolving AFTER the deadline is released, not leaked", async () => {
  // `start_oauth_loopback` cannot be cancelled while it runs: the attempt id it
  // will return does not exist yet. If we simply walk away on the deadline, the
  // listener it binds moments later holds its port for the full 300s and
  // supersedes the retry the user is now watching.
  let released: number | null = null;
  let settle: (h: { attemptId: number }) => void = () => {};
  const work = new Promise<{ attemptId: number }>((r) => {
    settle = r;
  });

  const p = withBrowserOpenDeadline(work, "loopback_bind", {
    ms: 5,
    releaseIfLate: (h) => {
      released = h.attemptId;
    },
  });
  await assert.rejects(
    p,
    (e: unknown) =>
      e instanceof IdentityError && e.code === "browser_open_timeout",
  );
  assert.equal(released, null, "nothing has been handed back yet");

  // The native command finally answers, long after we gave up on it.
  settle({ attemptId: 42 });
  await tick();
  assert.equal(
    released,
    42,
    "the orphaned native listener was never cancelled",
  );
});

test("a pre-browser step that beats the deadline is never released", async () => {
  let released = 0;
  const handle = await withBrowserOpenDeadline(
    Promise.resolve({ attemptId: 7 }),
    "loopback_bind",
    {
      ms: 200,
      releaseIfLate: () => {
        released += 1;
      },
    },
  );
  await tick();
  assert.equal(handle.attemptId, 7);
  assert.equal(released, 0, "a healthy listener was cancelled from under us");
});

test("parseCallbackQuery returns the WHOLE query when state matches (brokered flow)", () => {
  const query = parseCallbackQuery(
    "houston://auth-callback?state=st-1&code=c&providerId=apple.com",
    "st-1",
  );
  assert.equal(query, "state=st-1&code=c&providerId=apple.com");
});

test("appleReturnUrl joins the gateway base and the pinned bridge path", () => {
  assert.equal(
    appleReturnUrl("https://engine.gethouston.ai"),
    `https://engine.gethouston.ai${APPLE_RETURN_PATH}`,
  );
  // Trailing slashes on the gateway base never double up.
  assert.equal(
    appleReturnUrl("https://engine.gethouston.ai//"),
    `https://engine.gethouston.ai${APPLE_RETURN_PATH}`,
  );
});

test("parseCallbackQuery enforces CSRF state and provider errors like parseCallbackUrl", () => {
  assert.throws(
    () =>
      parseCallbackQuery("houston://auth-callback?state=other&code=c", "st-1"),
    (e: unknown) =>
      e instanceof IdentityError &&
      e.code === "invalid_idp_response" &&
      e.rawCode === "state_mismatch",
  );
  assert.throws(
    () =>
      parseCallbackQuery(
        "houston://auth-callback?state=st-1&error=access_denied",
        "st-1",
      ),
    (e: unknown) => e instanceof IdentityError && e.rawCode === "access_denied",
  );
});
