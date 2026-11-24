import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Credential } from "@earendil-works/pi-ai";
import { describe, expect, test, vi } from "vitest";
import { readAuthFile, writeAuthFile } from "../auth/auth-file";
import type { TurnCredentialChannel } from "../auth/turn-credential-channel";
import {
  currentUsedTokenDigest,
  newUsedTokenCapture,
  runWithUsedTokenCapture,
} from "../auth/used-token";
import { runWithActingContext } from "../session/acting-context";
import { reserveTurnCredential } from "./turn-credential-reserve";
import {
  TURN_RESERVE_RETRY_MS,
  TurnCredentialStore,
} from "./turn-credential-store";

const NOW = 1_800_000_000_000;

function authPath(): string {
  return join(mkdtempSync(join(tmpdir(), "turn-cred-store-")), "auth.json");
}

function seed(path: string, entries: Record<string, Credential>) {
  writeAuthFile(path, entries as Parameters<typeof writeAuthFile>[1]);
}

const accessOnly = (access: string, expires: number): Credential => ({
  type: "oauth",
  access,
  refresh: "",
  expires,
});

const channel = (
  over: Partial<TurnCredentialChannel> = {},
): TurnCredentialChannel => ({
  baseUrl: "https://gw.example",
  orgSlug: "org-1",
  agentSlug: "agent-1",
  hostToken: "turn-v1.token",
  actingAs: "acting-token",
  provider: "github-copilot",
  kind: "oauth",
  scope: "team",
  ...over,
});

function inTurn<T>(ch: TurnCredentialChannel | undefined, fn: () => T): T {
  return runWithActingContext(
    {
      credentialScopeKey: "u:turn:w:a",
      ...(ch ? { credentialChannel: ch } : {}),
    },
    fn,
  );
}

function gateway(
  answers: Array<() => Response>,
): typeof fetch & { calls: Array<{ url: string; headers: Headers }> } {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    const answer = answers.shift();
    if (!answer) throw new Error("unexpected gateway call");
    return answer();
  }) as typeof fetch & { calls: typeof calls };
  impl.calls = calls;
  return impl;
}

const served = (access: string, expires: number) => () =>
  Response.json({
    provider: "github-copilot",
    kind: "oauth",
    access,
    expires,
    accountId: null,
    enterpriseUrl: "ghe.example.com",
    scope: "team",
  });

function piRefreshClosure(refresher: (cred: Credential) => Credential) {
  return async (current: Credential | undefined) => {
    if (current?.type !== "oauth") return undefined;
    return refresher(current);
  };
}

describe("turn credential store", () => {
  test("an expiring access-only entry is re-served from the gateway before pi checks it", async () => {
    const path = authPath();
    seed(path, { "github-copilot": accessOnly("old", NOW + 60_000) });
    const fetchImpl = gateway([served("fresh", NOW + 25 * 60_000)]);
    const store = new TurnCredentialStore(
      path,
      (ch, p) => reserveTurnCredential(ch, p, fetchImpl),
      () => NOW,
    );

    const cred = await inTurn(channel(), () => store.read("github-copilot"));

    expect(cred).toEqual({
      type: "oauth",
      access: "fresh",
      refresh: "",
      expires: NOW + 25 * 60_000,
      enterpriseUrl: "ghe.example.com",
    });
    expect(readAuthFile(path)["github-copilot"]).toEqual(cred);
    expect(fetchImpl.calls).toHaveLength(1);
    const [call] = fetchImpl.calls;
    expect(call?.url).toBe(
      "https://gw.example/v1/pod/credentials/org-1/agent-1/github-copilot",
    );
    expect(call?.headers.get("authorization")).toBe("Bearer turn-v1.token");
    expect(call?.headers.get("x-houston-acting-as")).toBe("acting-token");
  });

  test("a healthy entry is never re-served", async () => {
    const path = authPath();
    seed(path, { "github-copilot": accessOnly("live", NOW + 20 * 60_000) });
    const reserve = vi.fn(async () => undefined);
    const store = new TurnCredentialStore(path, reserve, () => NOW);

    await inTurn(channel(), () => store.read("github-copilot"));

    expect(reserve).not.toHaveBeenCalled();
  });

  test("concurrent reads share one in-flight re-serve", async () => {
    const path = authPath();
    seed(path, { "github-copilot": accessOnly("old", NOW + 60_000) });
    let release: () => void = () => {};
    const reserve = vi.fn(
      (_ch: TurnCredentialChannel, p: string) =>
        new Promise<void>((resolve) => {
          release = () => {
            seed(p, { "github-copilot": accessOnly("fresh", NOW + 3_600_000) });
            resolve();
          };
        }),
    );
    const store = new TurnCredentialStore(path, reserve, () => NOW);

    const reads = inTurn(channel(), () =>
      Promise.all([
        store.read("github-copilot"),
        store.read("github-copilot"),
        store.read("github-copilot"),
      ]),
    );
    await vi.waitFor(() => expect(reserve).toHaveBeenCalledTimes(1));
    release();

    const creds = await reads;
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(creds.map((c) => (c?.type === "oauth" ? c.access : null))).toEqual([
      "fresh",
      "fresh",
      "fresh",
    ]);
  });

  test("a failed re-serve backs off instead of refetching on every request", async () => {
    const path = authPath();
    seed(path, { "github-copilot": accessOnly("old", NOW + 60_000) });
    let now = NOW;
    const fetchImpl = gateway([
      () => Response.json({ error: "gateway error" }, { status: 500 }),
      served("fresh", NOW + 3_600_000),
    ]);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new TurnCredentialStore(
      path,
      (ch, p) => reserveTurnCredential(ch, p, fetchImpl),
      () => now,
    );

    const first = await inTurn(channel(), () => store.read("github-copilot"));
    await inTurn(channel(), () => store.read("github-copilot"));
    now += TURN_RESERVE_RETRY_MS - 1;
    await inTurn(channel(), () => store.read("github-copilot"));

    expect(first?.type === "oauth" && first.access).toBe("old");
    expect(fetchImpl.calls).toHaveLength(1);
    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining("re-serving the github-copilot credential"),
      expect.stringContaining("(500)"),
    );

    now += 1;
    const later = await inTurn(channel(), () => store.read("github-copilot"));
    expect(later?.type === "oauth" && later.access).toBe("fresh");
    expect(fetchImpl.calls).toHaveLength(2);
    errors.mockRestore();
  });

  test("a not-connected answer writes nothing and leaves the token to fail on its own", async () => {
    const path = authPath();
    seed(path, { "github-copilot": accessOnly("old", NOW + 60_000) });
    const fetchImpl = gateway([
      () =>
        Response.json(
          { error: "org not connected" },
          { status: 404, headers: { "x-houston-not-connected": "1" } },
        ),
    ]);
    const store = new TurnCredentialStore(
      path,
      (ch, p) => reserveTurnCredential(ch, p, fetchImpl),
      () => NOW,
    );

    const cred = await inTurn(channel(), () => store.read("github-copilot"));
    await inTurn(channel(), () => store.read("github-copilot"));

    expect(cred).toEqual(accessOnly("old", NOW + 60_000));
    expect(readAuthFile(path)["github-copilot"]).toEqual(cred);
    expect(fetchImpl.calls).toHaveLength(1);
  });

  test("no channel, another provider, or an api key never reaches the gateway", async () => {
    const path = authPath();
    seed(path, {
      "github-copilot": accessOnly("old", NOW + 60_000),
      "openai-codex": accessOnly("codex", NOW + 60_000),
    });
    const reserve = vi.fn(async () => undefined);
    const store = new TurnCredentialStore(path, reserve, () => NOW);

    await store.read("github-copilot");
    await inTurn(channel(), () => store.read("openai-codex"));
    await inTurn(channel({ kind: "api_key" }), () =>
      store.read("github-copilot"),
    );

    expect(reserve).not.toHaveBeenCalled();
  });

  test("two concurrent turns each re-serve through their own channel", async () => {
    const pathA = authPath();
    const pathB = authPath();
    seed(pathA, { "github-copilot": accessOnly("a-old", NOW + 60_000) });
    seed(pathB, { "github-copilot": accessOnly("b-old", NOW + 60_000) });
    const seen: string[] = [];
    const reserve = async (ch: TurnCredentialChannel, p: string) => {
      seen.push(`${ch.agentSlug}:${p}`);
      seed(p, {
        "github-copilot": accessOnly(`${ch.agentSlug}-new`, NOW + 3_600_000),
      });
    };
    const a = new TurnCredentialStore(pathA, reserve, () => NOW);
    const b = new TurnCredentialStore(pathB, reserve, () => NOW);

    const [credA, credB] = await Promise.all([
      inTurn(channel({ agentSlug: "a" }), () => a.read("github-copilot")),
      inTurn(channel({ agentSlug: "b" }), () => b.read("github-copilot")),
    ]);

    expect(seen.sort()).toEqual([`a:${pathA}`, `b:${pathB}`]);
    expect(credA?.type === "oauth" && credA.access).toBe("a-new");
    expect(credB?.type === "oauth" && credB.access).toBe("b-new");
  });

  test("pi's refresh closure never sees an access-only entry, so no empty refresh token is posted", async () => {
    const path = authPath();
    seed(path, { "github-copilot": accessOnly("old", NOW + 60_000) });
    const store = new TurnCredentialStore(
      path,
      async () => undefined,
      () => NOW,
    );
    const refresher = vi.fn((c: Credential) => c);

    const settled = await store.modify(
      "github-copilot",
      piRefreshClosure(refresher),
    );

    expect(refresher).not.toHaveBeenCalled();
    expect(settled).toEqual(accessOnly("old", NOW + 60_000));
  });

  test("a full OAuth entry still refreshes and persists through modify", async () => {
    const path = authPath();
    seed(path, {
      "openai-codex": {
        type: "oauth",
        access: "a1",
        refresh: "r1",
        expires: NOW,
      },
    });
    const store = new TurnCredentialStore(path);

    const settled = await store.modify(
      "openai-codex",
      piRefreshClosure(
        (c) => ({ ...c, access: "a2", expires: NOW + 1 }) as Credential,
      ),
    );

    expect(settled).toMatchObject({ access: "a2", refresh: "r1" });
    expect(readAuthFile(path)["openai-codex"]).toMatchObject({ access: "a2" });
  });

  test("the used-token capture follows the re-served token", async () => {
    const path = authPath();
    seed(path, { "github-copilot": accessOnly("old", NOW + 60_000) });
    const store = new TurnCredentialStore(
      path,
      async (_ch, p) =>
        seed(p, { "github-copilot": accessOnly("fresh", NOW + 3_600_000) }),
      () => NOW,
    );
    const capture = newUsedTokenCapture();
    capture.record("github-copilot", "old");
    const before = capture.digestFor("github-copilot");

    const digest = await inTurn(channel(), () =>
      runWithUsedTokenCapture(capture, async () => {
        await store.read("github-copilot");
        return currentUsedTokenDigest("github-copilot");
      }),
    );

    expect(digest).toBeDefined();
    expect(digest).not.toBe(before);
  });

  test("list and delete work over the turn's file", async () => {
    const path = authPath();
    seed(path, {
      "github-copilot": accessOnly("old", NOW + 60_000),
      openai: { type: "api_key", key: "sk" },
    });
    const store = new TurnCredentialStore(path);

    expect(await store.list()).toEqual([
      { providerId: "github-copilot", type: "oauth" },
      { providerId: "openai", type: "api_key" },
    ]);
    await store.delete("github-copilot");
    expect(Object.keys(readAuthFile(path))).toEqual(["openai"]);
  });
});
