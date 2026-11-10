import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  LocalDirStore,
  type ObjectStore,
  PrefetchedObjectStore,
} from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { listClaimedTurnStore } from "./turn-store-listing";
import { claimedStoreScope } from "./turn-store-scope";

const PREFIX = "ws/org/agent";
const A = "workspaces/W/Bob";
const R = `${A}/.houston/runtime`;

function seeded(extra: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "store-listing-"));
  const rels = [
    "custom-integrations.json",
    ".pnpm-store/v10/index.json",
    "workspaces/ws/prefs.json",
    `${A}/CLAUDE.md`,
    `${A}/.agents/skills/brief/SKILL.md`,
    `${A}/.houston/activity/activity.json`,
    `${A}/.houston/config/config.json`,
    `${R}/settings.json`,
    `${R}/claude-flags/u1.json`,
    `${R}/conversations/c1.json`,
    `${R}/conversations/c1.archive/1.json`,
    `${R}/sessions/c1/1.jsonl`,
    ...Array.from({ length: 40 }, (_, n) => [
      `${R}/conversations/routine-${n}.json`,
      `${R}/sessions/routine-${n}/1.jsonl`,
    ]).flat(),
    `${A}/.repo-site/README.md`,
    `${A}/.repo-site/src/index.ts`,
    `${A}/uploads/photo.png`,
    ...extra,
  ];
  for (const rel of rels) {
    const file = join(root, PREFIX, ...rel.split("/"));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, rel);
  }
  return { root, rels, local: new LocalDirStore(root) };
}

/** The store, recording every listing call it answers. */
function recorded(inner: LocalDirStore) {
  const calls: string[] = [];
  const store: ObjectStore = {
    list: (p) => inner.list(p),
    manifest: (p = "") => {
      calls.push(`manifest ${p}`);
      return inner.manifest(p);
    },
    manifestDir: (p = "") => {
      calls.push(`level ${p}`);
      return inner.manifestDir(p);
    },
    download: (k, d, o) => inner.download(k, d, o),
    upload: (s, k, o) => inner.upload(s, k, o),
    delete: (k, o) => inner.delete(k, o),
  };
  return { store, calls };
}

const rel = (key: string) => key.slice(PREFIX.length + 1);

test("the walk lists exactly the critical scope, and the agent's folders later", async () => {
  const { rels, local } = seeded();
  const { store, calls } = recorded(local);
  const listing = await listClaimedTurnStore({
    store,
    prefix: PREFIX,
    conversationId: "c1",
  });
  const scope = claimedStoreScope(A, "c1");
  expect(listing?.objects.map(({ key }) => rel(key)).sort()).toEqual(
    rels.filter(scope.critical).sort(),
  );
  expect(listing?.reads).toEqual([`${PREFIX}/${R}/conversations/c1.json`]);
  expect(
    (await listing?.later?.(new AbortController().signal))
      ?.map(({ key }) => rel(key))
      .sort(),
  ).toEqual(rels.filter(scope.later).sort());
  // Never the whole store, never the folders of every conversation.
  for (const unlisted of [
    "",
    "workspaces",
    A,
    `${R}/conversations`,
    `${R}/sessions`,
    ".pnpm-store",
  ])
    expect(calls).not.toContain(
      `manifest ${PREFIX}${unlisted ? `/${unlisted}` : ""}`,
    );
});

test.each([
  ["a legacy per-turn tree", ["data/conversations/c1.json"]],
  ["two agents", ["workspaces/W/Alice/CLAUDE.md"]],
])("%s is listed whole", async (_shape, extra) => {
  const { local } = seeded(extra);
  expect(
    await listClaimedTurnStore({
      store: local,
      prefix: PREFIX,
      conversationId: "c1",
    }),
  ).toBeUndefined();
});

test("a store that cannot list one level is listed whole", async () => {
  const { local } = seeded();
  const { store } = recorded(local);
  const oldPodStore: ObjectStore = {
    ...store,
    manifestDir: async () => undefined,
  };
  const { manifestDir: _dropped, ...listOnly } = store;
  for (const candidate of [oldPodStore, listOnly])
    expect(
      await listClaimedTurnStore({
        store: candidate,
        prefix: PREFIX,
        conversationId: "c1",
      }),
    ).toBeUndefined();
});

test("a prefetched manifest is left to hydrate as the listing", async () => {
  const { local } = seeded();
  const store = new PrefetchedObjectStore(local, {
    manifest: await local.manifest(PREFIX),
    objects: new Map(),
  });
  expect(
    await listClaimedTurnStore({ store, prefix: PREFIX, conversationId: "c1" }),
  ).toBeUndefined();
  expect(store.servesListing).toBe(true);
});
