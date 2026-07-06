import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { PROVIDERS } from "../ai/providers";
import { config } from "../config";
import {
  applyServedCredential,
  type PiCred,
  readServedProvidersAt,
  removeServedCredentialAt,
  scrubRefreshTokensAt,
  writeServedProvidersAt,
} from "./auth-file";
import { selectExportCredential } from "./export";
import { syncServedCredential } from "./serve";

/** The host's authoritative "not connected" 404 (see routes/credential.ts). */
const notConnected404 = () =>
  new Response(null, {
    status: 404,
    headers: { "x-houston-not-connected": "1" },
  });

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

/**
 * HOU-573: GET /auth/status now hydrates the served credential so a brand-new
 * agent's model picker reflects the workspace's connect-once providers before its
 * first turn. The picker fires one status request PER provider in parallel, so the
 * hydration MUST share one in-flight sync — N concurrent syncs would each rewrite
 * auth.json at once (a write race) and pointlessly hammer the control plane.
 */
async function withServeMode(
  fetchImpl: typeof globalThis.fetch,
  body: () => Promise<void>,
): Promise<void> {
  const prevUrl = config.controlPlaneUrl;
  const prevTok = config.sandboxToken;
  const prevDataDir = config.dataDir;
  const prevFetch = globalThis.fetch;
  config.controlPlaneUrl = "http://control-plane.test";
  config.sandboxToken = "sbx-token";
  config.dataDir = mkdtempSync(join(tmpdir(), "houston-servemode-"));
  globalThis.fetch = fetchImpl;
  try {
    await body();
  } finally {
    globalThis.fetch = prevFetch;
    config.controlPlaneUrl = prevUrl;
    config.sandboxToken = prevTok;
    config.dataDir = prevDataDir;
  }
}

test("concurrent syncServedCredential calls share one in-flight sync (no auth.json write race)", async () => {
  let calls = 0;
  // 404 = "this provider isn't connected": no auth.json write, so the test stays
  // pure while still exercising one full per-provider probe sweep.
  const fetchImpl = (async () => {
    calls++;
    return notConnected404();
  }) as unknown as typeof globalThis.fetch;
  await withServeMode(fetchImpl, async () => {
    const [a, b, c] = await Promise.all([
      syncServedCredential(),
      syncServedCredential(),
      syncServedCredential(),
    ]);
    expect(a).toEqual([]);
    expect(b).toEqual([]);
    expect(c).toEqual([]);
    // Three concurrent callers, but only ONE batch of per-provider probes ran.
    // Anthropic is bypassed (materialized as the pod's own .credentials.json, not
    // served here), so the sweep probes every provider EXCEPT anthropic.
    expect(calls).toBe(PROVIDERS.filter((p) => p.id !== "anthropic").length);
  });
});

test("anthropic is bypassed: a central anthropic credential is never served to auth.json", async () => {
  // The pod materializes the Claude subscription as its own .credentials.json and
  // the SDK self-refreshes it there — so serve mode must never probe anthropic nor
  // write an access-only (refresh-stripped) anthropic entry into auth.json.
  const requested: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const provider = new URL(String(input)).searchParams.get("provider");
    if (provider) requested.push(provider);
    if (provider === "anthropic") {
      // The host WOULD serve it if asked — prove the runtime never asks.
      return new Response(
        JSON.stringify({
          provider: "anthropic",
          kind: "oauth",
          access: "AT-anthropic",
          expires: 1_900_000_000_000,
          accountId: null,
        }),
        { status: 200 },
      );
    }
    return notConnected404();
  }) as unknown as typeof globalThis.fetch;
  await withServeMode(fetchImpl, async () => {
    expect(await syncServedCredential()).toEqual([]);
    expect(requested).not.toContain("anthropic");
    // No anthropic entry was written (auth.json may not exist at all).
    const path = join(config.dataDir, "auth.json");
    const auth = existsSync(path)
      ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>)
      : {};
    expect(auth.anthropic).toBeUndefined();
  });
});

test("syncServedCredential is a no-op when serve mode is off (local desktop)", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return new Response(null, { status: 404 });
  }) as unknown as typeof globalThis.fetch;
  const prevUrl = config.controlPlaneUrl;
  const prevTok = config.sandboxToken;
  const prevFetch = globalThis.fetch;
  config.controlPlaneUrl = "";
  config.sandboxToken = "";
  globalThis.fetch = fetchImpl;
  try {
    expect(await syncServedCredential()).toEqual([]);
    expect(calls).toBe(0); // never reaches for the control plane locally
  } finally {
    globalThis.fetch = prevFetch;
    config.controlPlaneUrl = prevUrl;
    config.sandboxToken = prevTok;
  }
});

test("syncServedCredential removes manifest-tracked credentials on a central 404", async () => {
  const fetchImpl = (async () => {
    return notConnected404();
  }) as unknown as typeof globalThis.fetch;
  await withServeMode(fetchImpl, async () => {
    const path = join(config.dataDir, "auth.json");
    const manifestPath = join(config.dataDir, "served-providers.json");
    writeFileSync(
      path,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "AT-served",
          refresh: "",
          expires: 1,
        },
        "github-copilot": {
          type: "oauth",
          access: "AT-pending",
          refresh: "RT-pending-capture",
          expires: 2,
        },
        opencode: { type: "api_key", key: "sk-served" },
      }),
    );
    // These three were hydrated by earlier serves; the sign-out may touch them.
    writeServedProvidersAt(manifestPath, [
      "openai-codex",
      "github-copilot",
      "opencode",
    ]);

    expect(await syncServedCredential()).toEqual([]);
    const auth = readAuth(path);
    expect(auth["openai-codex"]).toBeUndefined();
    expect(auth.opencode).toBeUndefined();
    // Mid-capture (refresh-bearing) survives even when manifest-tracked.
    expect(auth["github-copilot"]).toEqual({
      type: "oauth",
      access: "AT-pending",
      refresh: "RT-pending-capture",
      expires: 2,
    });
    // The signed-out providers left the manifest.
    expect(readServedProvidersAt(manifestPath)).toEqual([]);
  });
});

test("a central 404 leaves locally-connected credentials alone (no manifest entry)", async () => {
  const fetchImpl = (async () => {
    return notConnected404();
  }) as unknown as typeof globalThis.fetch;
  await withServeMode(fetchImpl, async () => {
    const path = join(config.dataDir, "auth.json");
    // The Anthropic setup token and an openai-compatible local-model key are
    // written by pi locally and NEVER exist centrally — every serve 404s them.
    // They are shaped exactly like served entries, so only provenance saves them.
    writeFileSync(
      path,
      JSON.stringify({
        anthropic: { type: "api_key", key: "sk-ant-oat01-SETUP" },
        "openai-compatible": { type: "api_key", key: "houston-local" },
      }),
    );

    expect(await syncServedCredential()).toEqual([]);
    const auth = readAuth(path);
    expect(auth.anthropic).toEqual({
      type: "api_key",
      key: "sk-ant-oat01-SETUP",
    });
    expect(auth["openai-compatible"]).toEqual({
      type: "api_key",
      key: "houston-local",
    });
  });
});

test("a bare 404 without the not-connected marker is a hiccup, not a logout", async () => {
  // An old host, a wrong control-plane URL, or a route-level miss all produce
  // unmarked 404s — none of them may delete a working credential.
  const fetchImpl = (async () => {
    return new Response(null, { status: 404 });
  }) as unknown as typeof globalThis.fetch;
  await withServeMode(fetchImpl, async () => {
    const path = join(config.dataDir, "auth.json");
    const manifestPath = join(config.dataDir, "served-providers.json");
    writeFileSync(
      path,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "AT-served",
          refresh: "",
          expires: 1,
        },
      }),
    );
    writeServedProvidersAt(manifestPath, ["openai-codex"]);

    expect(await syncServedCredential()).toEqual([]);
    expect(readAuth(path)["openai-codex"]).toEqual({
      type: "oauth",
      access: "AT-served",
      refresh: "",
      expires: 1,
    });
    expect(readServedProvidersAt(manifestPath)).toEqual(["openai-codex"]);
  });
});

test("a serve marks the provider in the manifest, so a later sign-out removes it", async () => {
  let signedOut = false;
  const fetchImpl = (async (input: RequestInfo | URL) => {
    if (!signedOut && String(input).includes("provider=openai-codex")) {
      return new Response(
        JSON.stringify({
          provider: "openai-codex",
          kind: "oauth",
          access: "AT-central",
          expires: 1_900_000_000_000,
          accountId: null,
        }),
        { status: 200 },
      );
    }
    return notConnected404();
  }) as unknown as typeof globalThis.fetch;
  await withServeMode(fetchImpl, async () => {
    const path = join(config.dataDir, "auth.json");
    const manifestPath = join(config.dataDir, "served-providers.json");

    expect(await syncServedCredential()).toEqual(["openai-codex"]);
    expect(readServedProvidersAt(manifestPath)).toEqual(["openai-codex"]);
    expect(readAuth(path)["openai-codex"]?.access).toBe("AT-central");

    signedOut = true; // org-wide sign-out: central store now 404s everything
    expect(await syncServedCredential()).toEqual([]);
    expect(readAuth(path)["openai-codex"]).toBeUndefined();
    expect(readServedProvidersAt(manifestPath)).toEqual([]);
  });
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

test("removeServedCredentialAt removes only served-owned credentials for the requested provider", () => {
  const path = freshAuthPath();
  writeFileSync(
    path,
    JSON.stringify({
      "openai-codex": { type: "oauth", access: "A1", refresh: "", expires: 1 },
      anthropic: { type: "oauth", access: "A2", refresh: "", expires: 2 },
      opencode: { type: "api_key", key: "sk-opencode" },
    }),
  );

  expect(removeServedCredentialAt(path, "openai-codex")).toBe(true);
  expect(removeServedCredentialAt(path, "opencode")).toBe(true);
  const auth = readAuth(path);
  expect(auth["openai-codex"]).toBeUndefined();
  expect(auth.opencode).toBeUndefined();
  expect(auth.anthropic).toEqual({
    type: "oauth",
    access: "A2",
    refresh: "",
    expires: 2,
  });
});

test("removeServedCredentialAt keeps a refresh-bearing OAuth credential mid-capture", () => {
  const path = freshAuthPath();
  writeFileSync(
    path,
    JSON.stringify({
      "github-copilot": {
        type: "oauth",
        access: "AT-pending",
        refresh: "RT-pending-capture",
        expires: 2,
      },
    }),
  );

  expect(removeServedCredentialAt(path, "github-copilot")).toBe(false);
  expect(readAuth(path)["github-copilot"]).toEqual({
    type: "oauth",
    access: "AT-pending",
    refresh: "RT-pending-capture",
    expires: 2,
  });
});

// --- API-key providers (openrouter, deepseek, google, amazon-bedrock) ---

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
      deepseek: { type: "api_key", key: "sk-ds-KEEP" },
      google: { type: "api_key", key: "AIza-KEEP" },
      "amazon-bedrock": { type: "api_key", key: "bedrock-KEEP" },
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
  expect(auth.deepseek).toEqual({ type: "api_key", key: "sk-ds-KEEP" });
  expect(auth.google).toEqual({ type: "api_key", key: "AIza-KEEP" });
  expect(auth["amazon-bedrock"]).toEqual({
    type: "api_key",
    key: "bedrock-KEEP",
  });
});
