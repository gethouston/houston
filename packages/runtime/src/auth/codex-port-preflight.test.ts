import { type AddressInfo, createServer, type Server } from "node:net";
import { afterEach, expect, test } from "vitest";
import {
  CODEX_OAUTH_CALLBACK_PORT,
  CodexCallbackPortInUseError,
  preflightCodexCallbackPort,
} from "./codex-port-preflight";

// These unit tests probe an EPHEMERAL port, not the real 1455: vitest runs
// test files in parallel workers, and login.test.ts exercises the real port
// through startLogin — sharing 1455 across files made the suite racy. The
// preflight's port param exists as this test seam.

let squatter: Server | undefined;

afterEach(async () => {
  if (squatter) {
    await new Promise<void>((r) => squatter?.close(() => r()));
    squatter = undefined;
  }
});

/** Bind an OS-assigned free port and keep holding it (like a Codex CLI would
 *  hold 1455); returns the port the squatter owns. */
function occupyEphemeralPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    squatter = createServer();
    squatter.once("error", reject);
    squatter.listen(0, "127.0.0.1", () => {
      resolve((squatter?.address() as AddressInfo).port);
    });
  });
}

/** Find a free port, released again before the test uses it. */
async function freePort(): Promise<number> {
  const port = await occupyEphemeralPort();
  await new Promise<void>((r) => squatter?.close(() => r()));
  squatter = undefined;
  return port;
}

test("preflight resolves when the callback port is free", async () => {
  const port = await freePort();
  await expect(preflightCodexCallbackPort({ port })).resolves.toBeUndefined();
});

test("the free-port preflight leaves the port free for pi to bind next", async () => {
  const port = await freePort();
  await preflightCodexCallbackPort({ port });
  // The probe must not linger on the port: pi binds it moments later.
  await new Promise<void>((resolve, reject) => {
    squatter = createServer();
    squatter.once("error", reject);
    squatter.listen(port, "127.0.0.1", () => resolve());
  });
});

test("preflight fails fast with the actionable typed error when the port is busy", async () => {
  const port = await occupyEphemeralPort();
  const started = Date.now();
  const err = await preflightCodexCallbackPort({ port }).catch(
    (e: unknown) => e,
  );
  // EADDRINUSE surfaces near-instantly — nowhere near the 10-min spin it fixes.
  expect(Date.now() - started).toBeLessThan(2_000);
  expect(err).toBeInstanceOf(CodexCallbackPortInUseError);
  expect((err as CodexCallbackPortInUseError).kind).toBe(
    "codex_callback_port_busy",
  );
  // Copy is written for a non-technical user: names the remedy, not the errno.
  expect((err as Error).message).toContain(String(CODEX_OAUTH_CALLBACK_PORT));
  expect((err as Error).message).toContain("Close other AI coding tools");
});

test("retry after the port is released proceeds (preflight resolves again)", async () => {
  const port = await occupyEphemeralPort();
  await expect(preflightCodexCallbackPort({ port })).rejects.toBeInstanceOf(
    CodexCallbackPortInUseError,
  );
  await new Promise<void>((r) => squatter?.close(() => r()));
  squatter = undefined;
  await expect(preflightCodexCallbackPort({ port })).resolves.toBeUndefined();
});
