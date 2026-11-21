import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { STORE_SYNC_EXCLUDES } from "@houston/host/src/store-sync/daemon-policy";
import {
  LocalDirStore,
  type ObjectStore,
  STORE_ROOT_PACKAGE_EXCLUDES,
} from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { opTreeOptions } from "./op-tree-options";
import {
  CLAIMED_TURN_EXCLUDES,
  startTurnRequestFilesystem,
} from "./turn-claimed-hydration";
import { deferredWorkspaceFile } from "./turn-deferred-rule";
import { startTurnFilesystem, syncTurnFilesystem } from "./turn-filesystem";

const MiB = 1024 * 1024;
const PREFIX = "ws/org/agent";
const AGENT = "workspaces/Personal/Bob";
const PNPM_STORE = ".pnpm-store/v3/files/00/abc-index.json";

const LISTING: [rel: string, mib: number][] = [
  [PNPM_STORE, 1178.9],
  [`${AGENT}/webstudio/node_modules/react/index.js`, 556.0],
  [`${AGENT}/scrapegraph-ai/.venv/lib/python3.12/site-packages/x.py`, 493.7],
  [`${AGENT}/webstudio/.cache/pgdata/base/1/1259`, 179.1],
  [`${AGENT}/google-maps-scraper/bin/google-maps-scraper`, 91.0],
  [`${AGENT}/notebooklm-mcp/node_modules/zod/index.js`, 93.7],
  [`${AGENT}/webstudio/.git/objects/pack/pack-1.pack`, 59.5],
  [`${AGENT}/webstudio/src/rest.bin`, 114.8],
  [`${AGENT}/.houston/routines/routines.json`, 12.3],
];

const CLAIM = {
  claim: {
    id: "claim-1",
    token: "token-1",
    bootId: "boot-1",
    heartbeatUrl: "https://heartbeat.test",
  },
  conversationId: "c1",
};

function listedStore() {
  const storeRoot = mkdtempSync(join(tmpdir(), "pkg-store-"));
  const files: string[] = [
    ...LISTING.map(([rel]) => rel),
    `${AGENT}/CLAUDE.md`,
    `${AGENT}/.houston/runtime/settings.json`,
  ];
  for (const rel of files) {
    const abs = join(storeRoot, PREFIX, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, "x");
  }
  const listedSize = new Map(
    LISTING.map(([rel, mib]) => [`${PREFIX}/${rel}`, Math.round(mib * MiB)]),
  );
  const inner = new LocalDirStore(storeRoot);
  const downloads: string[] = [];
  const store: ObjectStore = {
    list: (p) => inner.list(p),
    manifest: async (p) =>
      (await inner.manifest(p)).map((o) => ({
        ...o,
        size: listedSize.get(o.key) ?? o.size,
      })),
    download: (key, dest, opts) => {
      downloads.push(key);
      return inner.download(key, dest, opts);
    },
    upload: (src, key, opts) => inner.upload(src, key, opts),
    delete: (key, opts) => inner.delete(key, opts),
  };
  return { store, storeRoot, downloads };
}

test("the store sync, a pooled turn and a settings op share the package-store list", () => {
  const settings = opTreeOptions({
    kind: "settings",
    action: "put",
    input: { model: "m" },
  });
  for (const list of [
    STORE_SYNC_EXCLUDES,
    CLAIMED_TURN_EXCLUDES,
    settings.excludes ?? [],
  ]) {
    expect(list).toEqual(
      expect.arrayContaining([...STORE_ROOT_PACKAGE_EXCLUDES]),
    );
  }
  expect(STORE_ROOT_PACKAGE_EXCLUDES).toEqual([".pnpm-store/"]);
});

test("the package store counts toward the startup cap; the agent's own files do not", async () => {
  const { store } = listedStore();
  await expect(
    startTurnFilesystem({
      store,
      prefix: PREFIX,
      root: mkdtempSync(join(tmpdir(), "pkg-root-")),
      claimed: true,
      maxBytes: 1024 * MiB,
      defer: deferredWorkspaceFile,
    }),
  ).rejects.toMatchObject({
    code: "hydrate_over_cap",
    message: expect.stringContaining("1024 MiB"),
  });
});

test("a pooled turn hydrates the listed store without its package store", async () => {
  const { store, storeRoot, downloads } = listedStore();
  const preparation = await startTurnRequestFilesystem({
    store,
    prefix: PREFIX,
    root: mkdtempSync(join(tmpdir(), "pkg-root-")),
    turn: CLAIM,
    timings: {},
  });
  const fs = await preparation.hydrated;
  await fs.workspaceReady;
  expect(await preparation.settled).toMatchObject({ ok: true });
  expect(fs.manifest.has(PNPM_STORE)).toBe(false);
  expect(existsSync(join(fs.storeRoot, ...PNPM_STORE.split("/")))).toBe(false);
  expect(downloads).not.toContain(`${PREFIX}/${PNPM_STORE}`);
  for (const [rel] of LISTING.slice(1))
    expect(fs.manifest.has(rel), rel).toBe(true);

  const made = [
    ".pnpm-store/v3/files/01/x",
    `${AGENT}/webstudio/node_modules/vite/index.js`,
  ];
  for (const rel of made) {
    const abs = join(fs.storeRoot, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, "new");
  }
  const synced = await syncTurnFilesystem({
    store,
    prefix: PREFIX,
    filesystem: fs,
    conversationId: "c1",
    claimed: true,
  });
  expect(synced.uploaded).toEqual([
    `${AGENT}/webstudio/node_modules/vite/index.js`,
  ]);
  expect(synced.deleted).toEqual([]);
  expect(existsSync(join(storeRoot, PREFIX, ...PNPM_STORE.split("/")))).toBe(
    true,
  );
});
