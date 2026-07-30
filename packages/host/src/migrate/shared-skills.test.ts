import {
  loadSkillsManifest,
  sharedSkillsDirKey,
  skillKey,
  skillKeyInDir,
  skillsDirKey,
} from "@houston/domain";
import { beforeEach, expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import { CloudPaths } from "../paths";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { migrateSharedSkills } from "./shared-skills";

const SKILL = Buffer.from(
  "---\nname: research\ndescription: Research well\n---\n\nDo research.\n",
);
const paths = new CloudPaths();
let store: MemoryWorkspaceStore;
let vfs: MemoryVfs;
let workspace: Workspace;

beforeEach(async () => {
  store = new MemoryWorkspaceStore();
  vfs = new MemoryVfs();
  workspace = await store.getOrCreatePersonalWorkspace("alice");
});

async function agent(name: string): Promise<Agent> {
  return store.createAgent({ workspaceId: workspace.id, name });
}

async function writeSkill(
  target: Agent,
  content = SKILL,
  siblings: Record<string, Buffer> = {},
) {
  const root = paths.agentRoot(workspace, target);
  await vfs.writeBytes(skillKey(root, "research"), content);
  for (const [relative, bytes] of Object.entries(siblings)) {
    await vfs.writeBytes(`${skillsDirKey(root)}/research/${relative}`, bytes);
  }
}

test("dedupes identical whole skill directories and enables the shared skill", async () => {
  const writer = await agent("Writer");
  const editor = await agent("Editor");
  const sibling = { "references/guide.bin": Buffer.from([0, 1, 255]) };
  await writeSkill(writer, SKILL, sibling);
  await writeSkill(editor, SKILL, sibling);

  const result = await migrateSharedSkills({
    store,
    vfs,
    paths,
    log: () => {},
  });

  expect(result).toEqual({
    sharedSkillsCreated: 1,
    agentCopiesRemoved: 2,
  });
  const sharedDir = sharedSkillsDirKey(paths.sharedRoot(workspace));
  expect(await vfs.readBytes(skillKeyInDir(sharedDir, "research"))).toEqual(
    SKILL,
  );
  expect(
    await vfs.readBytes(`${sharedDir}/research/references/guide.bin`),
  ).toEqual(sibling["references/guide.bin"]);
  for (const target of [writer, editor]) {
    const root = paths.agentRoot(workspace, target);
    expect(await vfs.list(`${skillsDirKey(root)}/research`)).toEqual([]);
    expect(await loadSkillsManifest(vfs, root)).toEqual({
      version: 1,
      enabled: ["research"],
    });
  }
});

test("leaves divergent SKILL.md copies untouched", async () => {
  const first = await agent("First");
  const second = await agent("Second");
  await writeSkill(first, Buffer.from(SKILL));
  await writeSkill(second, Buffer.from(`${SKILL.toString()}different`));

  const result = await migrateSharedSkills({
    store,
    vfs,
    paths,
    log: () => {},
  });

  expect(result.sharedSkillsCreated).toBe(0);
  expect(
    await vfs.readBytes(
      skillKey(paths.agentRoot(workspace, first), "research"),
    ),
  ).toEqual(SKILL);
  expect(
    await vfs.readBytes(
      skillKey(paths.agentRoot(workspace, second), "research"),
    ),
  ).not.toEqual(SKILL);
});

test("treats a differing sibling file as divergent", async () => {
  const first = await agent("First");
  const second = await agent("Second");
  await writeSkill(first, SKILL, {
    "references/guide.txt": Buffer.from("one"),
  });
  await writeSkill(second, SKILL, {
    "references/guide.txt": Buffer.from("two"),
  });

  const result = await migrateSharedSkills({
    store,
    vfs,
    paths,
    log: () => {},
  });

  expect(result).toEqual({
    sharedSkillsCreated: 0,
    agentCopiesRemoved: 0,
  });
  expect(
    await vfs.readText(
      `${skillsDirKey(paths.agentRoot(workspace, first))}/research/references/guide.txt`,
    ),
  ).toBe("one");
  expect(
    await vfs.readText(
      `${skillsDirKey(paths.agentRoot(workspace, second))}/research/references/guide.txt`,
    ),
  ).toBe("two");
});

test("is idempotent when run twice", async () => {
  const first = await agent("First");
  const second = await agent("Second");
  await writeSkill(first);
  await writeSkill(second);
  await migrateSharedSkills({ store, vfs, paths, log: () => {} });
  const sharedDir = sharedSkillsDirKey(paths.sharedRoot(workspace));
  const before = await vfs.readBytes(skillKeyInDir(sharedDir, "research"));

  const secondRun = await migrateSharedSkills({
    store,
    vfs,
    paths,
    log: () => {},
  });

  expect(secondRun).toEqual({
    sharedSkillsCreated: 0,
    agentCopiesRemoved: 0,
  });
  expect(await vfs.readBytes(skillKeyInDir(sharedDir, "research"))).toEqual(
    before,
  );
});

test("an empty workspace is a no-op with one summary log", async () => {
  const lines: string[] = [];

  const result = await migrateSharedSkills({
    store,
    vfs,
    paths,
    log: (line) => lines.push(line),
  });

  expect(result).toEqual({
    sharedSkillsCreated: 0,
    agentCopiesRemoved: 0,
  });
  expect(lines).toHaveLength(1);
});

test("never overwrites or adopts a slug already in the shared store", async () => {
  const first = await agent("First");
  const second = await agent("Second");
  await writeSkill(first);
  await writeSkill(second);
  const sharedDir = sharedSkillsDirKey(paths.sharedRoot(workspace));
  const existing = Buffer.from("existing shared bytes");
  await vfs.writeBytes(skillKeyInDir(sharedDir, "research"), existing);

  await migrateSharedSkills({ store, vfs, paths, log: () => {} });

  expect(await vfs.readBytes(skillKeyInDir(sharedDir, "research"))).toEqual(
    existing,
  );
  expect(
    await vfs.readBytes(
      skillKey(paths.agentRoot(workspace, first), "research"),
    ),
  ).toEqual(SKILL);
  expect(
    await loadSkillsManifest(vfs, paths.agentRoot(workspace, first)),
  ).toEqual({ version: 1, enabled: [] });
});
