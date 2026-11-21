import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import {
  resolveListedLayout,
  resolveTurnLayout,
  StoreEmptyError,
  type TurnSetupError,
} from "./turn-layout";

const root = () => mkdtemp(join(tmpdir(), "turn-layout-"));

test("resolves the single standing agent and creates its runtime data dir", async () => {
  const storeRoot = await root();
  const agentDir = join(storeRoot, "workspaces", "W", "A");
  await mkdir(agentDir, { recursive: true });
  await mkdir(join(storeRoot, "workspaces", "W", ".shared"), {
    recursive: true,
  });

  await expect(resolveTurnLayout(storeRoot)).resolves.toEqual({
    kind: "standing",
    workspaceDir: agentDir,
    workspaceRel: "workspaces/W/A",
    dataDir: join(agentDir, ".houston", "runtime"),
    dataRel: "workspaces/W/A/.houston/runtime",
  });
  await expect(access(join(agentDir, ".houston", "runtime"))).resolves.toBe(
    undefined,
  );
});

test.each([
  "data",
  "workspace",
])("resolves a cloudrun tree containing %s", async (present) => {
  const storeRoot = await root();
  await mkdir(join(storeRoot, present));

  await expect(resolveTurnLayout(storeRoot)).resolves.toEqual({
    kind: "cloudrun",
    workspaceDir: join(storeRoot, "workspace"),
    workspaceRel: "workspace",
    dataDir: join(storeRoot, "data"),
    dataRel: "data",
  });
});

test("an empty tree is a brand-new cloudrun layout", async () => {
  const storeRoot = await root();
  await expect(resolveTurnLayout(storeRoot)).resolves.toMatchObject({
    kind: "cloudrun",
    dataRel: "data",
  });
});

test.each([
  ["multiple agents", ["workspaces/W/A", "workspaces/W/B"]],
  ["standing plus cloudrun", ["workspaces/W/A", "data"]],
])("rejects an ambiguous %s tree", async (_name, directories) => {
  const storeRoot = await root();
  await Promise.all(
    directories.map((directory) =>
      mkdir(join(storeRoot, ...directory.split("/")), { recursive: true }),
    ),
  );

  await expect(resolveTurnLayout(storeRoot)).rejects.toMatchObject({
    code: "layout_unexpected",
  } satisfies Partial<TurnSetupError>);
});

async function seedFiles(storeRoot: string, rels: string[]) {
  await Promise.all(
    rels.map(async (rel) => {
      const path = join(storeRoot, ...rel.split("/"));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "x");
    }),
  );
}

const PRIME = [
  "workspaces/Personal/prime/CLAUDE.md",
  "workspaces/Personal/prime/.houston/activity/activity.json",
  "workspaces/Personal/prime/.houston/config/config.json",
];
const STRAY = [
  "workspaces/ws/Personal/preferences.json",
  "workspaces/ws/Personal/.houston/runtime/models-store.json",
  "workspaces/ws/Personal/.houston/runtime/runtime.log",
  "workspaces/ws/Personal/.houston/runtime/bin/claude-shell-fence",
  "workspaces/ws/Personal/.houston/activity/activity.schema.json",
];

test("a stray non-agent folder beside the agent is ignored", async () => {
  const storeRoot = await root();
  await seedFiles(storeRoot, [...PRIME, ...STRAY]);

  await expect(resolveTurnLayout(storeRoot)).resolves.toMatchObject({
    kind: "standing",
    workspaceRel: "workspaces/Personal/prime",
    dataRel: "workspaces/Personal/prime/.houston/runtime",
  });
});

test("the listing picks the agent while only the skeleton is on disk", async () => {
  const storeRoot = await root();

  await expect(
    resolveListedLayout(storeRoot, [...STRAY, ...PRIME], { allowEmpty: false }),
  ).resolves.toMatchObject({ workspaceRel: "workspaces/Personal/prime" });
});

test.each([
  ["instructions", "CLAUDE.md"],
  ["skills", ".agents/skills/report/SKILL.md"],
])("two real agents are still ambiguous (%s)", async (_name, marker) => {
  const storeRoot = await root();
  await seedFiles(storeRoot, [...PRIME, `workspaces/Personal/other/${marker}`]);

  await expect(resolveTurnLayout(storeRoot)).rejects.toMatchObject({
    code: "layout_unexpected",
  } satisfies Partial<TurnSetupError>);
});

const BENCH = [
  "workspaces/Personal/bench-increments-20260921-077/.houston/activity/activity.schema.json",
  "workspaces/Personal/bench-increments-20260921-077/.houston/routines/routines.schema.json",
  "workspaces/Personal/bench-increments-20260921-077/.houston/runtime/runtime.log",
  "workspaces/Personal/bench-increments-20260921-077/.houston/runtime/models-store.json",
];
const PREFS_NAMESPACE = [
  "workspaces/ws/Personal/preferences.json",
  "workspaces/ws/Personal/.houston/runtime/runtime.log",
  "workspaces/ws/Personal/.houston/runtime/models-store.json",
  "workspaces/ws/ws/preferences.json",
  "workspaces/ws/ws/.houston/runtime/runtime.log",
  "workspaces/ws/ws/.houston/runtime/models-store.json",
];
const BENCH_REL = "workspaces/Personal/bench-increments-20260921-077";

test("an unmarked agent beside the preferences namespace resolves", async () => {
  const storeRoot = await root();
  await seedFiles(storeRoot, [...PREFS_NAMESPACE, ...BENCH]);

  await expect(
    resolveTurnLayout(storeRoot, { allowEmpty: false }),
  ).resolves.toMatchObject({
    kind: "standing",
    workspaceRel: BENCH_REL,
    dataRel: `${BENCH_REL}/.houston/runtime`,
  });
});

test("the listing resolves the unmarked agent from the skeleton alone", async () => {
  const storeRoot = await root();

  await expect(
    resolveListedLayout(storeRoot, [...PREFS_NAMESPACE, ...BENCH], {
      allowEmpty: false,
    }),
  ).resolves.toMatchObject({ workspaceRel: BENCH_REL });
});

test("a preferences-namespace folder is never an agent, markers or not", async () => {
  const storeRoot = await root();
  const markedPrefs = [
    "workspaces/ws/Personal/CLAUDE.md",
    "workspaces/ws/Personal/.houston/config/config.json",
  ];

  await expect(
    resolveListedLayout(storeRoot, [...markedPrefs, ...PRIME], {
      allowEmpty: false,
    }),
  ).resolves.toMatchObject({ workspaceRel: "workspaces/Personal/prime" });
});

test("a store holding only the preferences namespace has no agent", async () => {
  const storeRoot = await root();
  await seedFiles(storeRoot, PREFS_NAMESPACE);

  await expect(
    resolveTurnLayout(storeRoot, { allowEmpty: false }),
  ).rejects.toMatchObject({
    code: "layout_unexpected",
  } satisfies Partial<TurnSetupError>);
});

test("two unmarked agents outside the namespace are still ambiguous", async () => {
  const storeRoot = await root();
  await seedFiles(storeRoot, [
    ...PREFS_NAMESPACE,
    ...BENCH,
    "workspaces/Personal/other/.houston/runtime/runtime.log",
  ]);

  await expect(resolveTurnLayout(storeRoot)).rejects.toMatchObject({
    code: "layout_unexpected",
  } satisfies Partial<TurnSetupError>);
});

test.each([
  "data",
  "workspace",
])("the namespace beside a per-turn %s tree resolves per-turn", async (present) => {
  const storeRoot = await root();
  await seedFiles(storeRoot, [...PREFS_NAMESPACE, `${present}/x.json`]);

  await expect(
    resolveTurnLayout(storeRoot, { allowEmpty: false }),
  ).resolves.toMatchObject({ kind: "cloudrun", dataRel: "data" });
});

test("a store holding only the namespace is an empty store", async () => {
  const storeRoot = await root();
  await seedFiles(storeRoot, PREFS_NAMESPACE);

  await expect(resolveTurnLayout(storeRoot)).resolves.toMatchObject({
    kind: "cloudrun",
    workspaceRel: "workspace",
  });
  const claimedRoot = await root();
  await expect(
    resolveListedLayout(claimedRoot, PREFS_NAMESPACE, { allowEmpty: false }),
  ).rejects.toSatisfy(
    (error) =>
      error instanceof StoreEmptyError &&
      error.code === "layout_unexpected" &&
      error.message ===
        "hydrated store is empty; a claimed turn needs an existing agent",
  );
});
