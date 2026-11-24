import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  LocalDirStore,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import { afterEach, expect, test, vi } from "vitest";
import { startTurnRequestFilesystem } from "./turn-claimed-hydration";
import { awaitDeferredNeed, WHOLE_TREE_WAIT_MS } from "./turn-deferred-files";
import {
  syncTurnFilesystem,
  TURN_DEFERRED_MAX_BYTES,
  TURN_HYDRATE_MAX_BYTES,
} from "./turn-filesystem";

const PREFIX = "ws/w1/agent-1";
const AGENT = "workspaces/Personal/Bob";
const CRITICAL_CAP = 1024;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function temp(name: string) {
  const dir = mkdtempSync(join(tmpdir(), name));
  dirs.push(dir);
  return dir;
}

function storeWithUserFiles(userBytes: number) {
  const storeRoot = temp("user-files-store-");
  const put = (rel: string, body: string) => {
    const path = join(storeRoot, PREFIX, ...rel.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  };
  put(`${AGENT}/CLAUDE.md`, "context");
  put(`${AGENT}/.houston/runtime/conversations/c1.json`, "{}");
  put(`${AGENT}/.houston/state/watermark.json`, "{}");
  put(`${AGENT}/Documents/scan.pdf`, "s".repeat(userBytes / 2));
  put(`${AGENT}/Videos/call.mp4`, "v".repeat(userBytes / 2));
  return { storeRoot, store: new LocalDirStore(storeRoot) };
}

function claimedTurn(
  store: ObjectStore,
  deferredMaxBytes?: number,
  maxBytes: number | undefined = CRITICAL_CAP,
) {
  return startTurnRequestFilesystem({
    store,
    prefix: PREFIX,
    root: temp("user-files-root-"),
    turn: {
      claim: {
        id: "claim-1",
        token: "token-1",
        bootId: "boot-1",
        heartbeatUrl: "https://heartbeat.test",
      },
      conversationId: "c1",
    },
    ...(maxBytes !== undefined ? { maxBytes } : {}),
    ...(deferredMaxBytes !== undefined ? { deferredMaxBytes } : {}),
    timings: {},
  });
}

test("the person's files have a budget of their own, larger than the startup cap", () => {
  expect(TURN_DEFERRED_MAX_BYTES).toBeGreaterThan(TURN_HYDRATE_MAX_BYTES);
});

test("a claimed turn whose user files pass the startup cap still starts and loads them", async () => {
  const { store } = storeWithUserFiles(8 * CRITICAL_CAP);
  const preparation = await claimedTurn(store);
  const fs = await preparation.hydrated;
  await fs.workspaceReady;
  expect(existsSync(join(fs.workspaceDir, "Documents", "scan.pdf"))).toBe(true);
  expect(existsSync(join(fs.workspaceDir, "Videos", "call.mp4"))).toBe(true);
});

test("user files over their own budget refuse only the tools, and sync touches nothing", async () => {
  const { storeRoot, store } = storeWithUserFiles(8 * CRITICAL_CAP);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const preparation = await claimedTurn(store, 2 * CRITICAL_CAP);
  const fs = await preparation.hydrated;
  expect(existsSync(join(fs.workspaceDir, "CLAUDE.md"))).toBe(true);
  await expect(fs.workspaceReady).rejects.toMatchObject({
    code: "hydrate_over_cap",
  });
  expect(error).not.toHaveBeenCalled();
  expect(info).toHaveBeenCalledWith(
    expect.stringContaining("deferred_files_over_budget listed=8192"),
  );
  error.mockRestore();
  info.mockRestore();
  const gate = fs.deferredGate;
  if (!gate) throw new Error("no deferred gate");
  const refusal = gate.waitForPaths(
    [join(fs.workspaceDir, "Documents", "scan.pdf")],
    undefined,
    WHOLE_TREE_WAIT_MS,
  );
  await expect(refusal).rejects.toThrow(
    /larger than one conversation can load: Documents\/scan\.pdf/,
  );
  await expect(refusal).rejects.not.toThrow(/again/);
  await expect(awaitDeferredNeed(gate, { kind: "all" })).rejects.toThrow(
    /Some of the agent's files could not be loaded/,
  );
  await expect(
    awaitDeferredNeed(gate, { kind: "all" }),
  ).resolves.toBeUndefined();
  expect(existsSync(join(fs.workspaceDir, "Documents", "scan.pdf"))).toBe(
    false,
  );
  const synced = await syncTurnFilesystem({
    store,
    prefix: PREFIX,
    filesystem: fs,
    conversationId: "c1",
    claimed: true,
  });
  expect(synced.uploaded).toEqual([]);
  expect(synced.deleted).toEqual([]);
  expect(
    existsSync(join(storeRoot, PREFIX, AGENT, "Documents", "scan.pdf")),
  ).toBe(true);
});

test("an agent listing 2.3 GiB of its person's files chats under the default caps", async () => {
  const MiB = 1024 * 1024;
  const listed = [390, 272, 169, 158, 119, 118, 1135];
  const { storeRoot } = storeWithUserFiles(2);
  listed.forEach((_, i) => {
    const path = join(storeRoot, PREFIX, AGENT, "Files", `f${i}`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "x");
  });
  const inner = new LocalDirStore(storeRoot);
  const size = new Map(
    listed.map((mib, i) => [`${PREFIX}/${AGENT}/Files/f${i}`, mib * MiB]),
  );
  const store: ObjectStore = {
    list: (p) => inner.list(p),
    manifest: async (p) =>
      (await inner.manifest(p)).map((o) => ({
        ...o,
        size: size.get(o.key) ?? o.size,
      })),
    download: (k, d, o) => inner.download(k, d, o),
    upload: (src, k, o) => inner.upload(src, k, o),
    delete: (k, o) => inner.delete(k, o),
  };
  const preparation = await claimedTurn(store, undefined, undefined);
  const fs = await preparation.hydrated;
  await fs.workspaceReady;
  expect(existsSync(join(fs.workspaceDir, "Files", "f0"))).toBe(true);
});
