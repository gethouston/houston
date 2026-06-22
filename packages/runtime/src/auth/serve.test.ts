import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyServedCredential, scrubRefreshTokensAt } from "./auth-file";

/**
 * Gate #2 invariant: the agent sandbox NEVER persists a refresh token.
 *  - A served credential is written with refresh="" (the control plane does
 *    not even send one anymore).
 *  - The post-connect scrub rewrites whatever pi's own device-code login wrote.
 * The old serve.ts wrote `refresh: c.refresh` to disk every turn while its
 * docstring claimed otherwise — these tests make that regression impossible.
 */

type AuthFile = Record<
  string,
  {
    type: string;
    access: string;
    refresh: string;
    expires: number;
    accountId?: string;
  }
>;

const freshAuthPath = () =>
  join(mkdtempSync(join(tmpdir(), "houston-auth-")), "auth.json");
const readAuth = (p: string) => JSON.parse(readFileSync(p, "utf8")) as AuthFile;

test("a served credential is written WITHOUT a refresh token", () => {
  const path = freshAuthPath();
  applyServedCredential(path, {
    provider: "openai-codex",
    access: "AT-fresh",
    expires: 1750000000000,
    accountId: "acct-1",
  });
  const auth = readAuth(path);
  expect(auth["openai-codex"]).toEqual({
    type: "oauth",
    access: "AT-fresh",
    refresh: "",
    expires: 1750000000000,
    accountId: "acct-1",
  });
  expect(JSON.stringify(auth)).not.toContain("RT"); // nothing refresh-like anywhere
});

test("a served credential overwrites a refresh-bearing entry from device-code login", () => {
  const path = freshAuthPath();
  // What pi's own login leaves behind:
  writeFileSync(
    path,
    JSON.stringify({
      "openai-codex": {
        type: "oauth",
        access: "AT-old",
        refresh: "RT-SECRET",
        expires: 1,
      },
    }),
  );
  applyServedCredential(path, {
    provider: "openai-codex",
    access: "AT-new",
    expires: 2,
    accountId: null,
  });
  const auth = readAuth(path);
  const codex = auth["openai-codex"];
  if (!codex) throw new Error("expected openai-codex entry in auth file");
  expect(codex.refresh).toBe("");
  expect(codex.access).toBe("AT-new");
});

test("scrub rewrites every refresh-bearing entry and reports the providers", () => {
  const path = freshAuthPath();
  writeFileSync(
    path,
    JSON.stringify({
      "openai-codex": {
        type: "oauth",
        access: "A1",
        refresh: "RT-1",
        expires: 1,
      },
      anthropic: { type: "oauth", access: "A2", refresh: "RT-2", expires: 2 },
    }),
  );
  expect(scrubRefreshTokensAt(path).sort()).toEqual([
    "anthropic",
    "openai-codex",
  ]);
  const auth = readAuth(path);
  const codex = auth["openai-codex"];
  if (!codex) throw new Error("expected openai-codex entry in auth file");
  const anthropic = auth.anthropic;
  if (!anthropic) throw new Error("expected anthropic entry in auth file");
  expect(codex.refresh).toBe("");
  expect(anthropic.refresh).toBe("");
  // Access tokens survive the scrub — the agent keeps working this turn.
  expect(codex.access).toBe("A1");
});

test("scrub is idempotent and a missing auth.json is a no-op", () => {
  const path = freshAuthPath();
  expect(scrubRefreshTokensAt(path)).toEqual([]); // no file
  writeFileSync(
    path,
    JSON.stringify({
      "openai-codex": { type: "oauth", access: "A", refresh: "", expires: 1 },
    }),
  );
  expect(scrubRefreshTokensAt(path)).toEqual([]); // already clean
});

// --- API-key providers (openrouter, google) ---

test("a served api-key credential is written as pi's api_key shape", () => {
  const path = freshAuthPath();
  applyServedCredential(path, {
    provider: "openrouter",
    kind: "api_key",
    access: "sk-or-v1-THEKEY",
    expires: Number.MAX_SAFE_INTEGER,
    accountId: null,
  });
  const auth = JSON.parse(readFileSync(path, "utf8")) as Record<
    string,
    unknown
  >;
  // pi reads `{ type: "api_key", key }` — no access/refresh/expires fields.
  expect(auth.openrouter).toEqual({
    type: "api_key",
    key: "sk-or-v1-THEKEY",
  });
});

test("scrub leaves api-key entries untouched (no refresh token to strip)", () => {
  const path = freshAuthPath();
  writeFileSync(
    path,
    JSON.stringify({
      "openai-codex": {
        type: "oauth",
        access: "A1",
        refresh: "RT-1",
        expires: 1,
      },
      openrouter: { type: "api_key", key: "sk-or-v1-KEEP" },
      google: { type: "api_key", key: "AIza-KEEP" },
    }),
  );
  // Only the OAuth provider is scrubbed; the api-key entries are reported as
  // unchanged and survive verbatim.
  expect(scrubRefreshTokensAt(path)).toEqual(["openai-codex"]);
  const auth = JSON.parse(readFileSync(path, "utf8")) as Record<
    string,
    { type?: string; key?: string; refresh?: string }
  >;
  expect(auth["openai-codex"]?.refresh).toBe("");
  expect(auth.openrouter).toEqual({ type: "api_key", key: "sk-or-v1-KEEP" });
  expect(auth.google).toEqual({ type: "api_key", key: "AIza-KEEP" });
});
