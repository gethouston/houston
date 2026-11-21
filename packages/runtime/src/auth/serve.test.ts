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

const notConnected404 = () =>
  new Response(null, {
    status: 404,
    headers: { "x-houston-not-connected": "1" },
  });

const oauth = (access: string, refresh: string): PiCred => ({
  type: "oauth",
  access,
  refresh,
  expires: 1_900_000_000_000,
});

test("selectExportCredential(provider) returns THAT provider, not the first in the record", () => {
  const auth: Record<string, PiCred> = {
    "openai-codex": oauth("AT-codex", "RT-codex"),
    "github-copilot": oauth("tid=copilot", "gho_github_token"),
  };
  expect(selectExportCredential(auth, "github-copilot")).toMatchObject({
    provider: "github-copilot",
    access: "tid=copilot",
  });
  expect(selectExportCredential(auth, "openai-codex")?.provider).toBe(
    "openai-codex",
  );
});

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
    const curated = new Set<string>(PROVIDERS.map((p) => p.id));
    expect(calls).toBe(
      PROVIDERS.length +
        piApiKeyProviderIds().filter((id) => !curated.has(id)).length,
    );
  });
});

test("an uncurated pi api-key provider (cerebras) is probed and re-hydrated from the central store", async () => {
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
    expect(
      readServedProvidersAt(join(config.dataDir, "served-providers.json")),
    ).toContain("cerebras");
  });
});

test("a served anthropic credential lands in auth.json as an access-only oauth entry", async () => {
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

function withTempHoustonHome(body: () => Promise<void>): Promise<void> {
  const prev = process.env.HOUSTON_HOME;
  process.env.HOUSTON_HOME = mkdtempSync(join(tmpdir(), "houston-home-"));
  return body().finally(() => {
    if (prev === undefined) delete process.env.HOUSTON_HOME;
    else process.env.HOUSTON_HOME = prev;
  });
}

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
        expect(existsSync(file)).toBe(true);
        connected = false;
        await syncServedCredential();
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
      expect(existsSync(file)).toBe(true);
    });
  });
});

test("a personal scope's anthropic disconnect leaves the pod-shared SDK credential file alone", async () => {
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
    expect(calls).toBe(0);
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
    writeServedProvidersAt(manifestPath, [
      "openai-codex",
      "github-copilot",
      "opencode",
    ]);

    expect(await syncServedCredential()).toEqual([]);
    const auth = readAuth(path);
    expect(auth["openai-codex"]).toBeUndefined();
    expect(auth.opencode).toBeUndefined();
    expect(auth["github-copilot"]).toEqual({
      type: "oauth",
      access: "AT-pending",
      refresh: "RT-pending-capture",
      expires: 2,
    });
    expect(readServedProvidersAt(manifestPath)).toEqual([]);
  });
});

test("a central 404 leaves locally-connected credentials alone (no manifest entry)", async () => {
  const fetchImpl = (async () => {
    return notConnected404();
  }) as unknown as typeof globalThis.fetch;
  await withServeMode(fetchImpl, async () => {
    const path = join(config.dataDir, "auth.json");
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

    signedOut = true;
    expect(await syncServedCredential()).toEqual([]);
    expect(readAuth(path)["openai-codex"]).toBeUndefined();
    expect(readServedProvidersAt(manifestPath)).toEqual([]);
  });
});

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
      expect(readServedProvidersAt(manifestPath)).toEqual(["openai-codex"]);
      expect(
        errors.mock.calls.some((c) => String(c[0]).includes("PRODUCT-1318")),
      ).toBe(true);
    });
  } finally {
    errors.mockRestore();
  }
});

test("serve sync leaves a REAL mid-capture login alone (different access)", async () => {
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

    expect(await syncServedCredential()).toEqual([]);
    expect(readAuth(path)["openai-codex"]).toEqual({
      type: "oauth",
      access: "AT-fresh-login",
      refresh: "RT-fresh-login",
      expires: 1,
    });
  });
});

test("scrubRefreshTokens(provider) marks the provider serve-owned at capture time (CRED-09)", async () => {
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
    expect(readAuth(path)["github-copilot"]?.refresh).toBe("RT-other");
    expect(readServedProvidersAt(manifestPath)).toEqual(["openai-codex"]);
    expect(scrubRefreshTokens("openai-codex")).toEqual([]);
    expect(readServedProvidersAt(manifestPath)).toEqual(["openai-codex"]);

    expect(await syncServedCredential()).toEqual([]);
    expect(readAuth(path)["openai-codex"]).toBeUndefined();
    expect(readServedProvidersAt(manifestPath)).toEqual([]);
  });
});

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
      expect(await syncServedCredential()).toEqual(["openai-codex"]);
      expect(calls()).toBe(2);
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
      expect(calls()).toBe(2);
      expect(readAuth(path)["openai-codex"]).toEqual({
        type: "oauth",
        access: "AT-served",
        refresh: "",
        expires: 1,
      });
      expect(readServedProvidersAt(manifestPath)).toEqual(["openai-codex"]);
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
      expect(probeCalls).toBe(providerCount * 2);
      expect(serveErrors()).toEqual([
        `[serve] control plane unreachable for all ${providerCount} providers: fetch failed (cause: ECONNREFUSED)`,
      ]);

      expect(await syncServedCredential()).toEqual([]);
      expect(serveErrors()).toHaveLength(1);
      expect(
        warns.mock.calls.some((c) =>
          String(c[0]).includes("control plane unreachable for all"),
        ),
      ).toBe(true);

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
      for (const id of blipped)
        expect(
          warns.mock.calls.some(
            (c) =>
              String(c[0]).includes(`credential ${id} unreachable`) &&
              String(c[0]).includes('500: {"error":"fetch failed"}'),
          ),
        ).toBe(true);
      expect(await syncServedCredential()).toEqual([]);
      expect(serveErrors()).toHaveLength(0);
    });
  } finally {
    errors.mockRestore();
    warns.mockRestore();
  }
}, 30_000);

test("a full-sweep gateway outage whose bodies echo each provider id logs ONE error (PRODUCT-1443)", async () => {
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
    "github-copilot": oauth("tid=copilot", ""),
  };
  expect(selectExportCredential(auth, "anthropic")).toBeNull();
  expect(selectExportCredential(auth, "github-copilot")).toBeNull();
});

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
  expect(JSON.stringify(auth)).not.toContain("RT");
});

test("a served credential preserves a refresh-bearing entry mid-capture", () => {
  const path = freshAuthPath();
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
  expect(codex.access).toBe("A1");
  expect(copilot.refresh).toBe("RT-copilot");
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
  expect(scrubRefreshTokenAt(path, "openai-codex")).toBe(false);
  writeFileSync(
    path,
    JSON.stringify({
      "openai-codex": { type: "oauth", access: "A", refresh: "", expires: 1 },
    }),
  );
  expect(scrubRefreshTokenAt(path, "openai-codex")).toBe(false);
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
    writeFileSync(
      path,
      JSON.stringify({ google: { type: "api_key", key: "ya29.a0DeadToken" } }),
    );
    writeServedProvidersAt(manifestPath, ["google"]);

    expect(await syncServedCredential()).toEqual([]);
    expect(readAuth(path).google).toBeUndefined();
    expect(readServedProvidersAt(manifestPath)).toEqual([]);

    await reportSeen;
    expect(reports).toEqual([
      {
        provider: "google",
        accessSha256: accessDigest("ya29.a0DeadToken"),
        scope: "team",
      },
    ]);

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
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await withServeMode(fetchImpl, async () => {
      await syncServedCredential();
      await reportSeen(1);
      await settle();
      await syncServedCredential();
      await reportSeen(2);
      await settle();
      reportStatus = 200;
      await syncServedCredential();
      await reportSeen(3);
      await settle();
      await syncServedCredential();
      await settle();
      expect(reports).toEqual([500, 500, 200]);
      const refusals = errors.mock.calls.filter((c) =>
        String(c[0]).includes("refusing it and reporting"),
      );
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

const removalLines = (logs: ReturnType<typeof vi.spyOn>) =>
  logs.mock.calls
    .map((c: unknown[]) => String(c[0]))
    .filter((line: string) =>
      line.startsWith("[serve] removed central credentials:"),
    );

test("a sync that removes a credential logs it with the reason", async () => {
  const logs = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
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
            access: "AT-served",
            refresh: "",
            expires: 1,
          },
        }),
      );
      writeServedProvidersAt(manifestPath, ["openai-codex"]);

      expect(await syncServedCredential()).toEqual([]);
      expect(readAuth(path)["openai-codex"]).toBeUndefined();
      expect(removalLines(logs)).toEqual([
        "[serve] removed central credentials: openai-codex (reason: central says not connected)",
      ]);
      expect(
        logs.mock.calls.some(
          (c) => String(c[0]) === "[serve] applied central credentials: (none)",
        ),
      ).toBe(true);
    });
  } finally {
    logs.mockRestore();
  }
});

test("a sync that removes nothing logs no removal line", async () => {
  const logs = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const fetchImpl = (async () =>
      notConnected404()) as unknown as typeof globalThis.fetch;
    await withServeMode(fetchImpl, async () => {
      expect(await syncServedCredential()).toEqual([]);
      expect(removalLines(logs)).toEqual([]);
    });
  } finally {
    logs.mockRestore();
  }
});

test("a refused dead served key is logged under its own reason", async () => {
  resetDeadKeyReportsForTest();
  const logs = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const { fetchImpl } = deadGoogleFetch("ya29.a0DeadToken");
    await withServeMode(fetchImpl, async () => {
      const manifestPath = join(config.dataDir, "served-providers.json");
      writeFileSync(
        join(config.dataDir, "auth.json"),
        JSON.stringify({
          google: { type: "api_key", key: "ya29.a0DeadToken" },
        }),
      );
      writeServedProvidersAt(manifestPath, ["google"]);

      expect(await syncServedCredential()).toEqual([]);
      expect(removalLines(logs)).toEqual([
        "[serve] removed central credentials: google (reason: the served key cannot authenticate)",
      ]);
    });
  } finally {
    logs.mockRestore();
  }
});
