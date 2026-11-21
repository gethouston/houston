import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { type ObjectStore, StoreConflictError } from "./object-store";
import { syncBack } from "./sync-back";
import { MERGE_UPLOAD_ATTEMPTS } from "./sync-back-merge-retry";

test("the board keeps six merge rounds", () => {
  expect(MERGE_UPLOAD_ATTEMPTS).toBe(6);
});

const DOC = "workspaces/Personal/Bob/.houston/activity/activity.json";
type Card = { id: string; title: string; status: string };

const body = (cards: Card[]) => `${JSON.stringify(cards, null, 2)}\n`;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

function racingStore(initial: Card[], racedUploads: number, race: RaceStep) {
  let remote = initial;
  let generation = 1;
  let uploads = 0;
  const preconditions: Array<string | undefined> = [];
  const store: ObjectStore = {
    list: async () => [DOC],
    download: async () => {
      throw new Error("versioned reads only");
    },
    downloadVersioned: async (_key, dest) => {
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, body(remote));
      return { generation: String(generation) };
    },
    upload: async (source, key, options) => {
      uploads += 1;
      preconditions.push(options?.ifGenerationMatch);
      if (uploads <= racedUploads) {
        remote = race(remote, uploads);
        generation += 1;
      }
      if (options?.ifGenerationMatch !== String(generation))
        throw new StoreConflictError(key, `412 at ${generation}`);
      remote = JSON.parse(await readFile(source, "utf8")) as Card[];
      generation += 1;
      return { generation: String(generation) };
    },
    delete: async () => undefined,
  };
  return { store, remote: () => remote, preconditions };
}

type RaceStep = (remote: Card[], upload: number) => Card[];

async function turnTree(base: Card[], local: Card[]) {
  const root = await mkdtemp(join(tmpdir(), "merge-retry-"));
  const abs = join(root, ...DOC.split("/"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, body(local));
  const manifest = new Map([
    [DOC, { hash: sha(body(base)), generation: "1", mergeBase: body(base) }],
  ]);
  return { root, abs, manifest };
}

const mine: Card = { id: "mine", title: "New mission", status: "running" };
const titled: Card = { ...mine, title: "Plan the Lisbon offsite" };
const sibling = (n: number): Card => ({
  id: `sibling-${n}`,
  title: "New mission",
  status: "running",
});
const addSibling: RaceStep = (remote, upload) => [
  ...remote.map((card) =>
    card.id === "mine" ? { ...card, status: `seen-${upload}` } : card,
  ),
  sibling(upload),
];

test("a board contended on every round but the last lands with every card and the title", async () => {
  const raced = MERGE_UPLOAD_ATTEMPTS;
  const { store, remote, preconditions } = racingStore(
    [mine],
    raced,
    addSibling,
  );
  const tree = await turnTree([mine], [titled]);

  const result = await syncBack(store, "", tree.root, tree.manifest, {
    generations: true,
    workerMerge: true,
    conflictBackoff: () => 0,
  });

  expect(result.conflicts).toEqual([]);
  expect(result.uploaded).toEqual([DOC]);
  expect(result.merges).toEqual([
    { key: DOC, attempts: MERGE_UPLOAD_ATTEMPTS },
  ]);
  expect(preconditions).toHaveLength(MERGE_UPLOAD_ATTEMPTS + 1);
  expect(remote()).toEqual([
    { ...titled, status: `seen-${raced}` },
    ...Array.from({ length: raced }, (_, i) => sibling(i + 1)),
  ]);
  const landed = await readFile(tree.abs, "utf8");
  expect(JSON.parse(landed)).toEqual(remote());
  expect(result.manifest.get(DOC)?.hash).toBe(sha(landed));
});

test("a board still contended after every round is a recorded conflict, never an overwrite", async () => {
  const { store, remote } = racingStore(
    [mine],
    MERGE_UPLOAD_ATTEMPTS + 1,
    addSibling,
  );
  const tree = await turnTree([mine], [titled]);

  const result = await syncBack(store, "", tree.root, tree.manifest, {
    generations: true,
    workerMerge: true,
    conflictBackoff: () => 0,
  });

  expect(result.uploaded).toEqual([]);
  expect(result.conflicts.map((c) => c.key)).toEqual([DOC]);
  expect(result.merges).toEqual([
    { key: DOC, attempts: MERGE_UPLOAD_ATTEMPTS },
  ]);
  expect(remote().find((card) => card.id === "mine")?.title).toBe(mine.title);
  expect(result.manifest.get(DOC)?.generation).toBe(
    String(MERGE_UPLOAD_ATTEMPTS + 1),
  );
});

test("each round merges the turn's own bytes: a card deleted between rounds stays deleted", async () => {
  const flicker: RaceStep = (remote, upload) =>
    upload === 1
      ? [...remote, sibling(9)]
      : remote.filter((card) => card.id !== "sibling-9");
  const { store, remote } = racingStore([mine], 2, flicker);
  const tree = await turnTree([mine], [titled]);

  const result = await syncBack(store, "", tree.root, tree.manifest, {
    generations: true,
    workerMerge: true,
    conflictBackoff: () => 0,
  });

  expect(result.merges).toEqual([{ key: DOC, attempts: 2 }]);
  expect(remote()).toEqual([titled]);
});

test("a landed merge names the board cards it removed from the remote", async () => {
  const gone: Card = { id: "gone", title: "Old mission", status: "done" };
  const { store, remote } = racingStore([mine, gone], 1, addSibling);
  const tree = await turnTree([mine, gone], [titled]);

  const result = await syncBack(store, "", tree.root, tree.manifest, {
    generations: true,
    workerMerge: true,
    conflictBackoff: () => 0,
  });

  expect(result.merges).toEqual([
    { key: DOC, attempts: 1, removedCards: ["gone"] },
  ]);
  expect(remote().map((card) => card.id)).toEqual(["mine", "sibling-1"]);
});
