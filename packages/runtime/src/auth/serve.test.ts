import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyServedCredential,
  type PiCred,
  scrubRefreshTokensAt,
} from "./auth-file";
import { selectExportCredential } from "./serve";

/**
 * Connect-once capture must be PROVIDER-SPECIFIC. The runtime exports the
 * just-connected provider's credential; exporting "whichever OAuth credential
 * comes first" stored the wrong provider centrally when more than one OAuth
 * provider was present, leaving the intended one (e.g. github-copilot)
 * un-persisted so every per-turn serve 404'd it — Copilot got no response while
 * the wrongly-captured provider worked.
 */
const oauth = (access: string, refresh: string): PiCred => ({
  type: "oauth",
  access,
  refresh,
  expires: 1_900_000_000_000,
});

test("selectExportCredential(provider) returns THAT provider, not the first in the record", () => {
  const auth: Record<string, PiCred> = {
    // codex comes first AND has a live refresh — the old code would export it.
    "openai-codex": oauth("AT-codex", "RT-codex"),
    "github-copilot": oauth("tid=copilot", "gho_github_token"),
  };
  expect(selectExportCredential(auth, "github-copilot")?.provider).toBe(
    "github-copilot",
  );
  expect(selectExportCredential(auth, "github-copilot")?.access).toBe(
    "tid=copilot",
  );
  // And it can still pick codex when codex is the one being connected.
  expect(selectExportCredential(auth, "openai-codex")?.provider).toBe(
    "openai-codex",
  );
});

test("selectExportCredential without a provider falls back to the first OAuth credential", () => {
  const auth: Record<string, PiCred> = {
    "openai-codex": oauth("AT-codex", "RT-codex"),
    "github-copilot": oauth("tid=copilot", "gho_github_token"),
  };
  expect(selectExportCredential(auth)?.provider).toBe("openai-codex");
});

test("selectExportCredential returns null when the requested provider is absent or scrubbed", () => {
  const auth: Record<string, PiCred> = {
    "openai-codex": oauth("AT-codex", "RT-codex"),
    // scrubbed: refresh="" => not exportable.
    "github-copilot": oauth("tid=copilot", ""),
  };
  expect(selectExportCredential(auth, "anthropic")).toBeNull();
  expect(selectExportCredential(auth, "github-copilot")).toBeNull();
});

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
    access?: string;
    refresh?: string;
    expires?: number;
    accountId?: string;
    key?: string;
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

test("an API-key served credential is written as pi's api_key variant (no refresh/expiry)", () => {
  const path = freshAuthPath();
  applyServedCredential(path, {
    provider: "opencode",
    access: "sk-opencode-zen-key",
    expires: 0,
    accountId: null,
    kind: "api_key",
  });
  const auth = readAuth(path);
  expect(auth.opencode).toEqual({
    type: "api_key",
    key: "sk-opencode-zen-key",
  });
  // No oauth fields leak in for an API key.
  expect(JSON.stringify(auth)).not.toContain("refresh");
});

test("scrub leaves api_key entries untouched (nothing to scrub)", () => {
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
      opencode: { type: "api_key", key: "sk-opencode" },
    }),
  );
  expect(scrubRefreshTokensAt(path)).toEqual(["openai-codex"]);
  const auth = readAuth(path);
  expect(auth.opencode).toEqual({ type: "api_key", key: "sk-opencode" });
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
