import { expect, test } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";

/**
 * The Proxy-stub removal (migration wave 3).
 *
 * The old adapter ended its constructor with a catch-all `Proxy` whose `get`
 * trap returned `async () => []` for ANY method the class didn't define, logging
 * a warning and silently resolving to an empty array. That is a no-silent-failure
 * violation (CLAUDE.md): a real bug — a typo'd method, or a legacy desktop/Rust
 * feature that doesn't exist on the host engine — was masked as "empty result".
 *
 * The Proxy is gone. Legacy methods that don't exist on the Houston TS host
 * engine now throw an explicit, descriptive error, and a genuinely undefined
 * method is `undefined` (a real TypeError on call) rather than a silent `[]`.
 */

function makeClient() {
  return new HoustonClient({
    baseUrl: "https://gateway.example",
    token: "t",
    controlPlane: true,
  });
}

test("a legacy desktop/Rust method throws explicitly instead of resolving to []", async () => {
  const client = makeClient();
  // Previously: `runShell()` hit the Proxy and resolved to `[]` with a warning.
  await expect(client.runShell()).rejects.toThrow(
    /runShell\(\) is unavailable on the Houston host engine/,
  );
});

test("every masked legacy method now rejects with its own name", async () => {
  const client = makeClient();
  const legacy = [
    "setGeminiApiKey",
    "createWorktree",
    "runShell",
    "tunnelStatus",
    "mintPairingCode",
    "claudeStatus",
    "composioStatus",
    "composioConnectApp",
  ] as const;
  for (const name of legacy) {
    await expect(
      (client as unknown as Record<string, () => Promise<unknown>>)[name](),
    ).rejects.toThrow(new RegExp(`${name}\\(\\) is unavailable`));
  }
});

test("a genuinely undefined method is undefined — no silent [] fallback", () => {
  const client = makeClient();
  // The catch-all Proxy would have made this an `async () => []`. It must now be
  // absent, so a stray call is a real TypeError the caller can see and report.
  const probe = client as unknown as { totallyMadeUpMethod?: unknown };
  expect(probe.totallyMadeUpMethod).toBeUndefined();
});
