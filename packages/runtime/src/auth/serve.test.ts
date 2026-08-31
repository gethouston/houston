import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accessDigest } from "@houston/protocol/access-digest";
import { expect, test, vi } from "vitest";
import { piApiKeyProviderIds } from "../ai/pi-catalog";
import { PROVIDERS } from "../ai/providers";
import {
  claudeCredentialsFile,
  claudeLoginConfigDir,
} from "../backends/claude/paths";
import { config } from "../config";
import { runWithActingContext } from "../session/acting-context";
import {
  applyServedCredential,
  type PiCred,
  readServedProvidersAt,
  removeServedCredentialAt,
  scrubRefreshTokenAt,
  writeServedProvidersAt,
} from "./auth-file";
import { selectExportCredential } from "./export";
import { scrubRefreshTokens, syncServedCredential } from "./serve";
import { resetServeProbeLog } from "./serve-log";
import { resetDeadKeyReportsForTest } from "./served-key-guard";

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
  expect(selectExportCredential(auth, "github-copilot")).toMatchObject({
    provider: "github-copilot",
    access: "tid=copilot",
  });
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
    // Three concurrent callers, but only ONE batch of per-provider probes ran —
    // EVERY provider, anthropic included (the host decides whether to serve it;
    // routes/credential.ts answers a marked 404 off the managed cloud), plus
    // every uncurated pi api-key provider (PRODUCT-1213).
    const curated = new Set<string>(PROVIDERS.map((p) => p.id));
    expect(calls).toBe(
      PROVIDERS.length +
        piApiKeyProviderIds().filter((id) => !curated.has(id)).length,
    );
  });
});

test("an uncurated pi api-key provider (cerebras) is probed and re-hydrated from the central store", async () => {
  // PRODUCT-1213: connect accepts a pasted key for ANY pi api-key provider and
  // the gateway stores it durably, but a recycled pod rebuilds auth.json only
  // from this sync. Probing just the curated catalog stranded e.g. a cerebras
  // key centrally — the pod read disconnected after every roll with no logout.
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const provider = new URL(String(input)).searchParams.get("provider");
    if (provider === "cerebras") {
      return new Response(
        JSON.stringify({
          provider: "cerebras",
          kind: "api_key",
          access: "csk-served",
          expires: 0,
          accountId: null,
        }),
        { status: 200 },
      );
    }
    return notConnected404();
  }) as unknown as typeof globalThis.fetch;
  await withServeMode(fetchImpl, async () => {
    expect(await syncServedCredential()).toEqual(["cerebras"]);
    const auth = JSON.parse(
      readFileSync(join(config.dataDir, "auth.json"), "utf8"),
    ) as Record<string, { type: string; key?: string }>;
    expect(auth.cerebras).toEqual({ type: "api_key", key: "csk-served" });
    // Serve-applied provenance: a later authoritative central sign-out may
    // remove exactly this entry.
    expect(
      readServedProvidersAt(join(config.dataDir, "served-providers.json")),
    ).toContain("cerebras");
  });
});

test("a served anthropic credential lands in auth.json as an access-only oauth entry", async () => {
  // Managed cloud: the gateway is the single refresher and serves a short-TTL
  // access token; the runtime writes it to auth.json (refresh="") and the SDK
  // backend rides it via CLAUDE_CODE_OAUTH_TOKEN. This is what lets a recycled
  // pod (emptyDir /data, credential files excluded from store-sync) reconnect
  // anthropic without the user doing anything.
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const provider = new URL(String(input)).searchParams.get("provider");
    if (provider === "anthropic") {
      return new Response(
        JSON.stringify({
          provider: "anthropic",
          kind: "oauth",
          access: "sk-ant-oat01-served",
          expires: 1_900_000_000_000,
          accountId: null,
        }),
        { status: 200 },
      );
    }
    return notConnected404();
  }) as unknown as typeof globalThis.fetch;
  await withServeMode(fetchImpl, async () => {
    expect(await syncServedCredential()).toEqual(["anthropic"]);
    const path = join(config.dataDir, "auth.json");
    const auth = JSON.parse(readFileSync(path, "utf8")) as Record<
      string,
      { type: string; access?: string; refresh?: string }
    >;
    expect(auth.anthropic).toEqual({
      type: "oauth",
      access: "sk-ant-oat01-served",
      refresh: "",
      expires: 1_900_000_000_000,
    });
  });
});

test("a served anthropic setup token (kind api_key) lands in auth.json as an api_key entry", async () => {
  // PRODUCT-1370: once the pasted setup token is captured centrally, the
  // gateway serves it back with kind "api_key". The runtime must write pi's
  // api_key variant — pi's anthropic provider auto-detects the sk-ant-oat
  // prefix, and the Claude SDK backend reads the same entry via
  // readAnthropicToken — and record serve provenance so a later authoritative
  // central sign-out can remove exactly this entry.
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const provider = new URL(String(input)).searchParams.get("provider");
    if (provider === "anthropic") {
      return new Response(
        JSON.stringify({
          provider: "anthropic",
          kind: "api_key",
          access: "sk-ant-oat01-captured",
          expires: Number.MAX_SAFE_INTEGER,
          accountId: null,
        }),
        { status: 200 },
      );
    }
    return notConnected404();
  }) as unknown as typeof globalThis.fetch;
  await withServeMode(fetchImpl, async () => {
    expect(await syncServedCredential()).toEqual(["anthropic"]);
    const auth = JSON.parse(
      readFileSync(join(config.dataDir, "auth.json"), "utf8"),
    ) as Record<string, { type: string; key?: string }>;
    expect(auth.anthropic).toEqual({
      type: "api_key",
      key: "sk-ant-oat01-captured",
    });
    expect(
      readServedProvidersAt(join(config.dataDir, "served-providers.json")),
    ).toContain("anthropic");
  });
});

/**
 * PRODUCT-1307 / Sentry HOUSTON-APP-4YA: the materialized
 * `<CLAUDE_CONFIG_DIR>/.credentials.json` is a SECOND copy of the anthropic
 * credential, and the Claude Agent SDK falls back to it the moment the served
 * env token disappears. When the central row is deleted (the HOU-952 revoked
 * heal, a real disconnect), leaving that file behind re-runs every turn on the
 * dead token family — with the served manifest emptied, no reporter can act,
 * and the storm only ends when the file's token expires. An authoritative
 * not-connected must therefore take the ghost file down with the auth.json
 * entry.
 */
function withTempHoustonHome(body: () => Promise<void>): Promise<void> {
  const prev = process.env.HOUSTON_HOME;
  process.env.HOUSTON_HOME = mkdtempSync(join(tmpdir(), "houston-home-"));
  return body().finally(() => {
    if (prev === undefined) delete process.env.HOUSTON_HOME;
    else process.env.HOUSTON_HOME = prev;
  });
}

/** A materialized SDK credential file, as a central push writes it. */
function writeMaterializedClaudeCredential(): string {
  mkdirSync(claudeLoginConfigDir(), { recursive: true });
  const file = claudeCredentialsFile();
  writeFileSync(
    file,
    JSON.stringify({
      claudeAiOauth: {
        accessToken: "sk-ant-oat01-dead",
        refreshToken: "",
        expiresAt: 9_000_000_000_000,
        scopes: ["user:inference"],
        subscriptionType: "max",
      },
    }),
  );
  return file;
}

/** Serves anthropic while `connected()` holds, authoritative 404 after. */
const anthropicServeFetch = (connected: () => boolean) =>
  (async (input: RequestInfo | URL) => {
    const provider = new URL(String(input)).searchParams.get("provider");
    if (provider === "anthropic" && connected()) {
      return new Response(
        JSON.stringify({
          provider: "anthropic",
          kind: "oauth",
          access: "sk-ant-oat01-served",
          expires: 1_900_000_000_000,
          accountId: null,
        }),
        { status: 200 },
      );
    }
    return notConnected404();
  }) as unknown as typeof globalThis.fetch;

test("an authoritative anthropic disconnect clears the ghost materialized SDK credential", async () => {
  await withTempHoustonHome(async () => {
    const file = writeMaterializedClaudeCredential();
    let connected = true;
    await withServeMode(
      anthropicServeFetch(() => connected),
      async () => {
        expect(await syncServedCredential()).toEqual(["anthropic"]);
        // While centrally connected the file is legitimate — it stays.
        expect(existsSync(file)).toBe(true);
        connected = false;
        await syncServedCredential();
        // The central row is gone: the auth.json entry AND the ghost go together.
        const auth = JSON.parse(
          readFileSync(join(config.dataDir, "auth.json"), "utf8"),
        ) as Record<string, unknown>;
        expect(auth.anthropic).toBeUndefined();
        expect(existsSync(file)).toBe(false);
      },
    );
  });
});

test("a never-manifested ghost credential is still cleared on an authoritative not-connected (PRODUCT-1323)", async () => {
  // The ghost can be planted while anthropic is OUTSIDE the served manifest —
  // a setup pod's non-attributed connect whose central row was later removed,
  // or a self-host row that was verify-rejected before any successful serve.
  // The old manifest-gated clear never ran for those, and the provenance gate
  // then blocked the revocation reporter too: PRODUCT-1307 through a
  // different door. The clear must not depend on serve provenance — the file
  // itself only ever comes from a central push.
  await withTempHoustonHome(async () => {
    const file = writeMaterializedClaudeCredential();
    const fetchImpl = (async () =>
      notConnected404()) as unknown as typeof globalThis.fetch;
    await withServeMode(fetchImpl, async () => {
      expect(await syncServedCredential()).toEqual([]);
      expect(existsSync(file)).toBe(false);
    });
  });
});

test("a deployment refusal (not-served-here) never clears the local credential file", async () => {
  // Desktop/self-host hosts answer EVERY anthropic serve with the marked 404
  // plus `x-houston-not-served-here`: a deployment fact, not a store verdict.
  // There the materialized file belongs to the local browser login — reading
  // the refusal as a disconnect would delete a healthy credential on every
  // sync (the regression the PRODUCT-1323 review caught).
  await withTempHoustonHome(async () => {
    const file = writeMaterializedClaudeCredential();
    const fetchImpl = (async () =>
      new Response(null, {
        status: 404,
        headers: {
          "x-houston-not-connected": "1",
          "x-houston-not-served-here": "1",
        },
      })) as unknown as typeof globalThis.fetch;
    await withServeMode(fetchImpl, async () => {
      expect(await syncServedCredential()).toEqual([]);
      expect(existsSync(file)).toBe(true);
    });
  });
});

test("a personal scope never clears the pod-shared ghost, manifest or not", async () => {
  const actingToken = (sub: string) =>
    `acting-v1.${Buffer.from(
      JSON.stringify({ sub, agent: "acme", exp: 9_000_000_000 }),
    ).toString("base64url")}.sig`;
  await withTempHoustonHome(async () => {
    const file = writeMaterializedClaudeCredential();
    const fetchImpl = (async () =>
      notConnected404()) as unknown as typeof globalThis.fetch;
    await withServeMode(fetchImpl, async () => {
      await runWithActingContext(
        { actingAs: actingToken("sub-bob") },
        async () => {
          expect(await syncServedCredential()).toEqual([]);
        },
      );
      // The shared login dir is TEAM material (HOU-976): a member's own
      // not-connected verdict must not delete the workspace's file.
      expect(existsSync(file)).toBe(true);
    });
  });
});

test("a personal scope's anthropic disconnect leaves the pod-shared SDK credential file alone", async () => {
  // The shared login dir is the TEAM's credential (HOU-976): a member whose
  // personal row disconnects must not take the workspace's file with it.
  const actingToken = (sub: string) =>
    `acting-v1.${Buffer.from(
      JSON.stringify({ sub, agent: "acme", exp: 9_000_000_000 }),
    ).toString("base64url")}.sig`;
  await withTempHoustonHome(async () => {
    const file = writeMaterializedClaudeCredential();
    let connected = true;
    await withServeMode(
      anthropicServeFetch(() => connected),
      async () => {
        await runWithActingContext(
          { actingAs: actingToken("sub-alice") },
          async () => {
            expect(await syncServedCredential()).toEqual(["anthropic"]);
            connected = false;
            await syncServedCredential();
          },
        );
        expect(existsSync(file)).toBe(true);
      },
    );
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

/** Serves one openai-codex OAuth credential with the given access token. */
const codexServeFetch = (access: string) =>
  (async (input: RequestInfo | URL) => {
    if (
      new URL(String(input)).searchParams.get("provider") === "openai-codex"
    ) {
      return new Response(
        JSON.stringify({
          provider: "openai-codex",
          kind: "oauth",
          access,
          expires: 1_900_000_000_000,
          accountId: null,
        }),
        { status: 200 },
      );
    }
    return notConnected404();
  }) as unknown as typeof globalThis.fetch;

test("serve sync self-heals a lost capture scrub when central serves the SAME access (PRODUCT-1318)", async () => {
  // The capture PUT landed centrally but the post-capture scrub failed all its
  // retries. The leftover refresh-bearing entry used to be permanent: apply
  // skipped it (mid-capture guard), removal refused it, and this pod silently
  // kept rotating the family alongside the gateway — two rotators, mutual
  // invalid_grant, org-wide sign-out. Central serving the very access token the
  // local entry holds PROVES the capture landed, so the sync finishes the scrub.
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await withServeMode(codexServeFetch("AT-captured"), async () => {
      const path = join(config.dataDir, "auth.json");
      const manifestPath = join(config.dataDir, "served-providers.json");
      writeFileSync(
        path,
        JSON.stringify({
          "openai-codex": {
            type: "oauth",
            access: "AT-captured",
            refresh: "RT-leftover",
            expires: 1,
          },
        }),
      );

      expect(await syncServedCredential()).toEqual(["openai-codex"]);
      expect(readAuth(path)["openai-codex"]).toEqual({
        type: "oauth",
        access: "AT-captured",
        refresh: "",
        expires: 1_900_000_000_000,
      });
      // Serve-owned again: a later authoritative sign-out can remove it.
      expect(readServedProvidersAt(manifestPath)).toEqual(["openai-codex"]);
      // Loud, not silent: a heal firing means a capture-time scrub was lost.
      expect(
        errors.mock.calls.some((c) => String(c[0]).includes("PRODUCT-1318")),
      ).toBe(true);
    });
  } finally {
    errors.mockRestore();
  }
});

test("serve sync leaves a REAL mid-capture login alone (different access)", async () => {
  // A fresh device-code login between the previous credential's serve and its
  // own capture: the local refresh-bearing entry carries a DIFFERENT access
  // than the central row, so the capture has NOT landed — scrubbing here would
  // destroy the only copy of the new refresh token before /auth/export ships it.
  await withServeMode(codexServeFetch("AT-old-central"), async () => {
    const path = join(config.dataDir, "auth.json");
    writeFileSync(
      path,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "AT-fresh-login",
          refresh: "RT-fresh-login",
          expires: 1,
        },
      }),
    );

    expect(await syncServedCredential()).toEqual([]); // apply still skips it
    expect(readAuth(path)["openai-codex"]).toEqual({
      type: "oauth",
      access: "AT-fresh-login",
      refresh: "RT-fresh-login",
      expires: 1,
    });
  });
});

test("scrubRefreshTokens(provider) marks the provider serve-owned at capture time (CRED-09)", async () => {
  // The scrub route only fires after a successful central PUT, so THIS is the
  // moment the provider becomes serve-owned — not its first serve. Without it,
  // a capture followed by a sign-out before any serve ran left an entry no
  // authoritative 404 could ever remove.
  const fetchImpl = (async () =>
    notConnected404()) as unknown as typeof globalThis.fetch;
  await withServeMode(fetchImpl, async () => {
    const path = join(config.dataDir, "auth.json");
    const manifestPath = join(config.dataDir, "served-providers.json");
    writeFileSync(
      path,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "AT-cap",
          refresh: "RT-cap",
          expires: 1,
        },
        "github-copilot": {
          type: "oauth",
          access: "AT-other",
          refresh: "RT-other",
          expires: 2,
        },
      }),
    );

    expect(scrubRefreshTokens("openai-codex")).toEqual(["openai-codex"]);
    expect(readAuth(path)["openai-codex"]?.refresh).toBe("");
    // Provider-scoped: the concurrent connect's refresh survives (PRODUCT-1320).
    expect(readAuth(path)["github-copilot"]?.refresh).toBe("RT-other");
    expect(readServedProvidersAt(manifestPath)).toEqual(["openai-codex"]);
    // A retried scrub (already clean) still reports settled ownership.
    expect(scrubRefreshTokens("openai-codex")).toEqual([]);
    expect(readServedProvidersAt(manifestPath)).toEqual(["openai-codex"]);

    // The org signs out before this provider was ever served: the authoritative
    // 404 can now remove the local copy because capture marked ownership.
    expect(await syncServedCredential()).toEqual([]);
    expect(readAuth(path)["openai-codex"]).toBeUndefined();
    expect(readServedProvidersAt(manifestPath)).toEqual([]);
  });
});

// --- Probe retry through the full sync (PRODUCT-1324 / HOUSTON-APP-4YV) ---

/** A served openai-codex answer; other providers 404. `failFirst` codex calls
 *  throw the undici socket-failure shape before answers begin. */
function flakyCodexFetch(failCount: () => boolean) {
  let codexCalls = 0;
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const provider = new URL(String(input)).searchParams.get("provider");
    if (provider === "openai-codex") {
      codexCalls++;
      if (failCount())
        throw Object.assign(new TypeError("fetch failed"), {
          cause: Object.assign(new Error("read ECONNRESET"), {
            code: "ECONNRESET",
          }),
        });
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
  return { fetchImpl, calls: () => codexCalls };
}

test("one transient probe failure retries, the provider still applies, and no ERROR is logged", async () => {
  resetServeProbeLog();
  let failed = false;
  const { fetchImpl, calls } = flakyCodexFetch(() => {
    if (failed) return false;
    failed = true;
    return true;
  });
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await withServeMode(fetchImpl, async () => {
      // The retry heals the blip: the provider is APPLIED this sync — a
      // freshly recycled pod's first turn no longer reads a connected
      // provider as not-connected.
      expect(await syncServedCredential()).toEqual(["openai-codex"]);
      expect(calls()).toBe(2);
      // 4YV-class noise stays out of Sentry: the blip is a WARN breadcrumb.
      expect(
        errors.mock.calls.filter((c) =>
          String(c[0]).includes("[serve] credential"),
        ),
      ).toEqual([]);
      expect(
        warns.mock.calls.some(
          (c) =>
            String(c[0]).includes("retrying once") &&
            String(c[0]).includes("ECONNRESET"),
        ),
      ).toBe(true);
    });
  } finally {
    errors.mockRestore();
    warns.mockRestore();
  }
});

test("a probe that fails both attempts warns with the cause code and removes nothing", async () => {
  resetServeProbeLog();
  const { fetchImpl, calls } = flakyCodexFetch(() => true);
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await withServeMode(fetchImpl, async () => {
      const path = join(config.dataDir, "auth.json");
      const manifestPath = join(config.dataDir, "served-providers.json");
      // An earlier sync applied codex to this pod.
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
      expect(calls()).toBe(2); // attempt + one retry, then final
      // An error verdict removes NOTHING: the applied credential and its
      // manifest entry survive for the next sync to reconcile.
      expect(readAuth(path)["openai-codex"]).toEqual({
        type: "oauth",
        access: "AT-served",
        refresh: "",
        expires: 1,
      });
      expect(readServedProvidersAt(manifestPath)).toEqual(["openai-codex"]);
      // A socket reset is a connectivity failure — a WARN breadcrumb carrying
      // the nested cause code that `err.message` alone loses, never a Sentry
      // error (PRODUCT-1602).
      expect(
        errors.mock.calls.filter((c) =>
          String(c[0]).includes("[serve] credential"),
        ),
      ).toEqual([]);
      expect(
        warns.mock.calls.some(
          (c) =>
            String(c[0]).includes("credential openai-codex unreachable") &&
            String(c[0]).includes("ECONNRESET"),
        ),
      ).toBe(true);

      // The next sync re-attempts the probe and stays warning-level too.
      expect(await syncServedCredential()).toEqual([]);
      expect(calls()).toBe(4);
      expect(
        errors.mock.calls.filter((c) =>
          String(c[0]).includes("[serve] credential"),
        ),
      ).toEqual([]);
    });
  } finally {
    errors.mockRestore();
    warns.mockRestore();
  }
});

test("a sweep where EVERY probe is refused logs ONE error, not one per provider (PRODUCT-1399)", async () => {
  // A runtime whose host has closed under it (pod shutdown), or a gateway
  // outage: 41 identical ECONNREFUSED verdicts are one incident. Logging each
  // made every such sweep 41 Sentry events in HOUSTON-APP-4YV.
  resetServeProbeLog();
  let refuse = true;
  let probeCalls = 0;
  const fetchImpl = (async () => {
    probeCalls++;
    if (refuse)
      throw Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:4318"), {
          code: "ECONNREFUSED",
        }),
      });
    return notConnected404();
  }) as unknown as typeof globalThis.fetch;
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  const infos = vi.spyOn(console, "info").mockImplementation(() => {});
  const serveErrors = () =>
    errors.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.startsWith("[serve]"));
  try {
    await withServeMode(fetchImpl, async () => {
      const providerCount = new Set([
        ...PROVIDERS.map((p) => p.id),
        ...piApiKeyProviderIds(),
      ]).size;
      expect(await syncServedCredential()).toEqual([]);
      expect(probeCalls).toBe(providerCount * 2); // attempt + one retry each
      expect(serveErrors()).toEqual([
        `[serve] control plane unreachable for all ${providerCount} providers: fetch failed (cause: ECONNREFUSED)`,
      ]);

      // The identical repeat is a WARN breadcrumb, never a second event.
      expect(await syncServedCredential()).toEqual([]);
      expect(serveErrors()).toHaveLength(1);
      expect(
        warns.mock.calls.some((c) =>
          String(c[0]).includes("control plane unreachable for all"),
        ),
      ).toBe(true);

      // Recovery is logged once and re-arms the incident.
      refuse = false;
      expect(await syncServedCredential()).toEqual([]);
      expect(infos).toHaveBeenCalledWith(
        "[serve] control plane reachable again",
      );
      refuse = true;
      expect(await syncServedCredential()).toEqual([]);
      expect(serveErrors()).toHaveLength(2);
    });
  } finally {
    errors.mockRestore();
    warns.mockRestore();
    infos.mockRestore();
  }
}, 30_000);

test("probes caught by ONE gateway blip mid-sweep are warnings, never Sentry errors (PRODUCT-1602)", async () => {
  // A control-plane restart seen through the gateway: the probes in flight
  // during the window get `500: {"error":"fetch failed"}` while the rest of
  // the sweep answers normally. A connectivity blip is not a Houston
  // incident — every release roll answers the whole awake fleet this way, so
  // even the collapsed once-per-transition error (PRODUCT-1423) minted one
  // Sentry event per pod per blip.
  resetServeProbeLog();
  const blipped = new Set(["google", "openrouter", "opencode-go"]);
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const provider = new URL(String(input)).searchParams.get("provider");
    if (provider && blipped.has(provider))
      return new Response(JSON.stringify({ error: "fetch failed" }), {
        status: 500,
      });
    return notConnected404();
  }) as unknown as typeof globalThis.fetch;
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  const serveErrors = () =>
    errors.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.startsWith("[serve]"));
  try {
    await withServeMode(fetchImpl, async () => {
      expect(await syncServedCredential()).toEqual([]);
      expect(serveErrors()).toHaveLength(0);
      // Each caught provider leaves a warning breadcrumb with the detail.
      for (const id of blipped)
        expect(
          warns.mock.calls.some(
            (c) =>
              String(c[0]).includes(`credential ${id} unreachable`) &&
              String(c[0]).includes('500: {"error":"fetch failed"}'),
          ),
        ).toBe(true);
      // The persistent repeat stays warning-level too.
      expect(await syncServedCredential()).toEqual([]);
      expect(serveErrors()).toHaveLength(0);
    });
  } finally {
    errors.mockRestore();
    warns.mockRestore();
  }
}, 30_000);

test("a full-sweep gateway outage whose bodies echo each provider id logs ONE error (PRODUCT-1443)", async () => {
  // The HOUSTON-APP-4YV residual: a gateway outage answers EVERY probe
  // `500: {"error":"credential gateway GET <id> failed (500): …"}`. The echoed
  // provider id made every detail unique, so neither the PRODUCT-1399 uniform
  // collapse nor the PRODUCT-1423 group collapse fired — one blip stayed 41
  // Sentry events. Normalizing the probe's own id out of the detail
  // (serve-probe.ts) makes the sweep uniform again.
  resetServeProbeLog();
  const gatewayBody = (provider: string) =>
    JSON.stringify({
      error: `credential gateway GET ${provider} failed (500): {"error":"gateway error"}`,
    });
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const provider = new URL(String(input)).searchParams.get("provider") ?? "";
    return new Response(gatewayBody(provider), { status: 500 });
  }) as unknown as typeof globalThis.fetch;
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  const serveErrors = () =>
    errors.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.startsWith("[serve]"));
  try {
    await withServeMode(fetchImpl, async () => {
      const providerCount = new Set([
        ...PROVIDERS.map((p) => p.id),
        ...piApiKeyProviderIds(),
      ]).size;
      expect(await syncServedCredential()).toEqual([]);
      expect(serveErrors()).toEqual([
        `[serve] control plane unreachable for all ${providerCount} providers: 500: ${gatewayBody("<provider>")}`,
      ]);
      // The identical repeat stays a WARN breadcrumb, never a second event.
      expect(await syncServedCredential()).toEqual([]);
      expect(serveErrors()).toHaveLength(1);
      expect(
        warns.mock.calls.some((c) =>
          String(c[0]).includes("control plane unreachable for all"),
        ),
      ).toBe(true);
    });
  } finally {
    errors.mockRestore();
    warns.mockRestore();
  }
}, 30_000);

test("mid-sweep gateway 500s with echoed provider ids stay warnings (PRODUCT-1443 / PRODUCT-1602)", async () => {
  // The partial-sweep sibling: only the probes caught by the blip fail, each
  // with its own id echoed in the body. Normalized (PRODUCT-1443) they share
  // one detail; as a gateway-echo connectivity failure that detail is
  // warning-only (PRODUCT-1602).
  resetServeProbeLog();
  const blipped = new Set(["google", "openrouter", "opencode-go"]);
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const provider = new URL(String(input)).searchParams.get("provider");
    if (provider && blipped.has(provider))
      return new Response(
        JSON.stringify({
          error: `credential gateway GET ${provider} failed (500): {"error":"gateway error"}`,
        }),
        { status: 500 },
      );
    return notConnected404();
  }) as unknown as typeof globalThis.fetch;
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  const serveErrors = () =>
    errors.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.startsWith("[serve]"));
  try {
    await withServeMode(fetchImpl, async () => {
      expect(await syncServedCredential()).toEqual([]);
      expect(serveErrors()).toHaveLength(0);
      // The warning carries the NORMALIZED detail — the echoed id replaced —
      // so the still-failing dedup compares byte-identical strings.
      for (const id of blipped)
        expect(
          warns.mock.calls.some(
            (c) =>
              String(c[0]).includes(`credential ${id} unreachable`) &&
              String(c[0]).includes(
                "credential gateway GET <provider> failed (500): ",
              ),
          ),
        ).toBe(true);
    });
  } finally {
    errors.mockRestore();
    warns.mockRestore();
  }
}, 30_000);

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

test("a served credential preserves a refresh-bearing entry mid-capture", () => {
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
  expect(
    applyServedCredential(path, {
      provider: "openai-codex",
      access: "AT-new",
      expires: 2,
      accountId: null,
    }),
  ).toBe(false);
  const auth = readAuth(path);
  expect(auth["openai-codex"]).toEqual({
    type: "oauth",
    access: "AT-old",
    refresh: "RT-SECRET",
    expires: 1,
  });
});

test("a served credential replaces an existing refresh-less entry", () => {
  const path = freshAuthPath();
  writeFileSync(
    path,
    JSON.stringify({
      "openai-codex": {
        type: "oauth",
        access: "AT-old",
        refresh: "",
        expires: 1,
      },
    }),
  );
  expect(
    applyServedCredential(path, {
      provider: "openai-codex",
      access: "AT-new",
      expires: 2,
      accountId: null,
    }),
  ).toBe(true);
  const auth = readAuth(path);
  const codex = auth["openai-codex"];
  if (!codex) throw new Error("expected openai-codex entry in auth file");
  expect(codex.refresh).toBe("");
  expect(codex.access).toBe("AT-new");
});

test("the scrub is provider-scoped: a concurrent connect's refresh token survives (PRODUCT-1320)", () => {
  // Two OAuth connects interleave: codex's capture lands and scrubs while
  // copilot's own login just wrote its refresh token, BEFORE copilot's capture
  // exported it. The old whole-file scrub erased copilot's refresh here —
  // copilot's capture then found nothing to export and the credential ended
  // access-only centrally, dying at first expiry.
  const path = freshAuthPath();
  writeFileSync(
    path,
    JSON.stringify({
      "openai-codex": {
        type: "oauth",
        access: "A1",
        refresh: "RT-codex",
        expires: 1,
      },
      "github-copilot": {
        type: "oauth",
        access: "A2",
        refresh: "RT-copilot",
        expires: 2,
      },
    }),
  );
  expect(scrubRefreshTokenAt(path, "openai-codex")).toBe(true);
  const auth = readAuth(path);
  const codex = auth["openai-codex"];
  if (!codex) throw new Error("expected openai-codex entry in auth file");
  const copilot = auth["github-copilot"];
  if (!copilot) throw new Error("expected github-copilot entry in auth file");
  expect(codex.refresh).toBe("");
  // Access tokens survive the scrub — the agent keeps working this turn.
  expect(codex.access).toBe("A1");
  // The mid-capture neighbor is untouched: its own capture can still export.
  expect(copilot.refresh).toBe("RT-copilot");
  // ...and copilot's later scrub settles it too.
  expect(scrubRefreshTokenAt(path, "github-copilot")).toBe(true);
  expect(readAuth(path)["github-copilot"]?.refresh).toBe("");
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
  expect(scrubRefreshTokenAt(path, "openai-codex")).toBe(true);
  expect(scrubRefreshTokenAt(path, "opencode")).toBe(false);
  const auth = readAuth(path);
  expect(auth.opencode).toEqual({ type: "api_key", key: "sk-opencode" });
});

test("scrub is idempotent and a missing auth.json is a no-op", () => {
  const path = freshAuthPath();
  expect(scrubRefreshTokenAt(path, "openai-codex")).toBe(false); // no file
  writeFileSync(
    path,
    JSON.stringify({
      "openai-codex": { type: "oauth", access: "A", refresh: "", expires: 1 },
    }),
  );
  expect(scrubRefreshTokenAt(path, "openai-codex")).toBe(false); // already clean
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
  // Only the captured OAuth provider is scrubbed; the api-key entries are
  // reported as unchanged and survive verbatim.
  expect(scrubRefreshTokenAt(path, "openai-codex")).toBe(true);
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

// --- Dead served google keys (HOU-1107 / Sentry HOUSTON-APP-4Y9) ---

/** Serves a google api_key credential; captures revoked-token reports. */
function deadGoogleFetch(access: string) {
  const reports: Array<Record<string, unknown>> = [];
  let signalReport: (() => void) | undefined;
  const reportSeen = new Promise<void>((resolve) => {
    signalReport = resolve;
  });
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/sandbox/credential/revoked") {
      reports.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      signalReport?.();
      return new Response(JSON.stringify({ ok: true, removed: true }), {
        status: 200,
      });
    }
    if (url.searchParams.get("provider") === "google") {
      return new Response(
        JSON.stringify({
          provider: "google",
          kind: "api_key",
          access,
          expires: Number.MAX_SAFE_INTEGER,
          accountId: null,
        }),
        { status: 200 },
      );
    }
    return notConnected404();
  }) as unknown as typeof globalThis.fetch;
  return { fetchImpl, reports, reportSeen };
}

test("a served google 'api key' that is an OAuth token is refused, removed, and reported", async () => {
  resetDeadKeyReportsForTest();
  const { fetchImpl, reports, reportSeen } =
    deadGoogleFetch("ya29.a0DeadToken");
  await withServeMode(fetchImpl, async () => {
    const path = join(config.dataDir, "auth.json");
    const manifestPath = join(config.dataDir, "served-providers.json");
    // An earlier (unguarded) sync already applied the dead key to this pod.
    writeFileSync(
      path,
      JSON.stringify({ google: { type: "api_key", key: "ya29.a0DeadToken" } }),
    );
    writeServedProvidersAt(manifestPath, ["google"]);

    // Refused: never applied, and the previously-applied copy is dropped so
    // google reads not-connected (the visible connect card) instead of
    // burning every turn on a doomed 401.
    expect(await syncServedCredential()).toEqual([]);
    expect(readAuth(path).google).toBeUndefined();
    expect(readServedProvidersAt(manifestPath)).toEqual([]);

    // Reported by digest so the store deletes the central row (HOU-952
    // pipeline) — the whole workspace heals, not just this pod.
    await reportSeen;
    expect(reports).toEqual([
      {
        provider: "google",
        accessSha256: accessDigest("ya29.a0DeadToken"),
        scope: "team",
      },
    ]);

    // A second sync re-serves the same dead key (the delete is idempotent on
    // the store side); the report is deduped for the pod's lifetime.
    expect(await syncServedCredential()).toEqual([]);
    expect(reports.length).toBe(1);
  });
});

test("a failed dead-row report logs ONE error, retries quietly, and stops once delivered", async () => {
  resetDeadKeyReportsForTest();
  const reports: number[] = [];
  let reportStatus = 500;
  const waiters: Array<{ n: number; resolve: () => void }> = [];
  const reportSeen = (n: number) =>
    new Promise<void>((resolve) => {
      if (reports.length >= n) return resolve();
      waiters.push({ n, resolve });
    });
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/sandbox/credential/revoked") {
      reports.push(reportStatus);
      for (const w of waiters.filter((w) => reports.length >= w.n)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve();
      }
      return new Response(JSON.stringify({ ok: true, removed: true }), {
        status: reportStatus,
      });
    }
    if (url.searchParams.get("provider") === "google") {
      return new Response(
        JSON.stringify({
          provider: "google",
          kind: "api_key",
          access: "ya29.a0DeadToken",
          expires: Number.MAX_SAFE_INTEGER,
          accountId: null,
        }),
        { status: 200 },
      );
    }
    return notConnected404();
  }) as unknown as typeof globalThis.fetch;
  // Let a fire-and-forget report fully settle (its finally clears the
  // in-flight marker in microtasks after the fetch handler resolved).
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await withServeMode(fetchImpl, async () => {
      // Sync 1: refuse + report; the control plane answers 500.
      await syncServedCredential();
      await reportSeen(1);
      await settle();
      // Sync 2: the failed report is RETRIED — but without a second error.
      await syncServedCredential();
      await reportSeen(2);
      await settle();
      // Control plane recovers; sync 3's retry is delivered.
      reportStatus = 200;
      await syncServedCredential();
      await reportSeen(3);
      await settle();
      // Sync 4: delivered reports are never repeated.
      await syncServedCredential();
      await settle();
      expect(reports).toEqual([500, 500, 200]);
      const refusals = errors.mock.calls.filter((c) =>
        String(c[0]).includes("refusing it and reporting"),
      );
      // The single Sentry event per pod lifetime (HOUSTON-APP-567): a control
      // plane that keeps failing the delete must not add one error per sync.
      expect(refusals.length).toBe(1);
      expect(
        warns.mock.calls.some((c) =>
          String(c[0]).includes("dead-key report for google failed"),
        ),
      ).toBe(true);
      expect(
        warns.mock.calls.some((c) =>
          String(c[0]).includes("retrying the dead-row report"),
        ),
      ).toBe(true);
    });
  } finally {
    errors.mockRestore();
    warns.mockRestore();
  }
});

test("a served google key with the real AIza shape is applied normally", async () => {
  resetDeadKeyReportsForTest();
  const { fetchImpl, reports } = deadGoogleFetch("AIzaSyServedRealKey");
  await withServeMode(fetchImpl, async () => {
    expect(await syncServedCredential()).toEqual(["google"]);
    const auth = readAuth(join(config.dataDir, "auth.json"));
    expect(auth.google).toEqual({
      type: "api_key",
      key: "AIzaSyServedRealKey",
    });
    expect(reports).toEqual([]);
  });
});

test("a served azure credential lands its endpoint file beside auth.json (PRODUCT-1532)", async () => {
  // The azure KEY is workspace-central, but the per-resource endpoint used to
  // live only where the connect ran — every other runtime was served a key
  // aimed at nothing and each turn died with "base URL is required". The
  // endpoint now rides the row's enterpriseUrl slot; the sweep must land it.
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const provider = new URL(String(input)).searchParams.get("provider");
    if (provider === "azure-openai-responses") {
      return new Response(
        JSON.stringify({
          provider: "azure-openai-responses",
          kind: "api_key",
          access: "azure-key",
          expires: Number.MAX_SAFE_INTEGER,
          accountId: null,
          enterpriseUrl: "https://acme.openai.azure.com",
        }),
        { status: 200 },
      );
    }
    return notConnected404();
  }) as unknown as typeof globalThis.fetch;
  await withServeMode(fetchImpl, async () => {
    expect(await syncServedCredential()).toEqual(["azure-openai-responses"]);
    const auth = JSON.parse(
      readFileSync(join(config.dataDir, "auth.json"), "utf8"),
    ) as Record<string, { type: string; key?: string }>;
    expect(auth["azure-openai-responses"]).toEqual({
      type: "api_key",
      key: "azure-key",
    });
    expect(
      JSON.parse(
        readFileSync(join(config.dataDir, "azure-endpoint.json"), "utf8"),
      ),
    ).toEqual({ baseUrl: "https://acme.openai.azure.com" });
  });
});
