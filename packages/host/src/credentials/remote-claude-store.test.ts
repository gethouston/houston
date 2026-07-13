import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { RemoteClaudeCredentialStore } from "./remote-claude-store";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function path() {
  const dir = mkdtempSync(join(tmpdir(), "houston-claude-remote-"));
  dirs.push(dir);
  return join(dir, ".credentials.json");
}

const envelope = JSON.stringify({
  claudeAiOauth: {
    accessToken: "access",
    refreshToken: "refresh",
    expiresAt: 1_800_000_000_000,
    scopes: ["user:inference"],
  },
});

function store(fetchImpl: typeof fetch) {
  return new RemoteClaudeCredentialStore({
    baseUrl: "https://gateway.example/",
    orgSlug: "0123456789abcdef",
    agentSlug: "aaaaaaaaaaaaaaaa",
    podToken: "host-token",
    fetchImpl,
  });
}

test("restore materializes the exact remote envelope before runtime boot", async () => {
  const target = path();
  const calls: string[] = [];
  const remote = store((async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push(`${init?.method ?? "GET"} ${String(url)}`);
    return new Response(envelope, { status: 200 });
  }) as typeof fetch);
  expect(await remote.restore(target)).toBe(true);
  expect(readFileSync(target, "utf8")).toBe(envelope);
  expect(calls[0]).toContain(
    "/v1/pod/claude-oauth/0123456789abcdef/aaaaaaaaaaaaaaaa",
  );
});

test("a missing remote credential leaves the local file absent", async () => {
  const target = path();
  const remote = store(
    (async () =>
      new Response(`{"error":"credential not found"}`, {
        status: 404,
      })) as typeof fetch,
  );
  expect(await remote.restore(target)).toBe(false);
  expect(existsSync(target)).toBe(false);
});

test("sync uploads an SDK-rotated refresh token once", async () => {
  const target = path();
  const uploaded: string[] = [];
  const remote = store((async (
    _url: string | URL | Request,
    init?: RequestInit,
  ) => {
    uploaded.push(String(init?.body));
    return new Response(`{"ok":true}`, { status: 200 });
  }) as typeof fetch);
  writeFileSync(target, envelope);
  await remote.sync(target);
  await remote.sync(target);
  expect(uploaded).toEqual([envelope]);
});

test("invalid local files are never uploaded", async () => {
  const target = path();
  let calls = 0;
  const remote = store((async () => {
    calls++;
    return new Response(`{"ok":true}`);
  }) as typeof fetch);
  writeFileSync(target, `{"claudeAiOauth":{"accessToken":"access"}}`);
  await remote.sync(target);
  expect(calls).toBe(0);
});
