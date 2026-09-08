import {
  composeSkillMd,
  saveActivities,
  saveRoutines,
  sharedSkillsDirKey,
  skillKey,
  skillKeyInDir,
} from "@houston/domain";
import { expect, test } from "vitest";
import { LocalPaths } from "../paths";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { localEntityDirectory } from "./entity-directory-local";

test("local directory uses owned live documents and excludes its coordinator identity", async () => {
  const store = new MemoryWorkspaceStore({ defaultRuntime: "local" });
  const ws = await store.getOrCreatePersonalWorkspace("owner");
  const assistant = await store.createAgent({
    workspaceId: ws.id,
    name: "Assistant",
  });
  const agent = await store.createAgent({ workspaceId: ws.id, name: "Dobby" });
  const outsider = await store.getOrCreatePersonalWorkspace("other");
  const foreign = await store.createAgent({
    workspaceId: outsider.id,
    name: "Private",
  });
  const vfs = new MemoryVfs();
  const paths = new LocalPaths();
  const root = paths.agentRoot(ws, agent);
  await saveActivities(vfs, root, [
    { id: "a", title: "Research", description: "", status: "done" },
  ]);
  await saveRoutines(vfs, root, [
    {
      id: "r",
      name: "Morning",
      prompt: "Research",
      enabled: true,
      integrations: [],
      created_at: "2026-01-01",
      schedule: "0 9 * * *",
      updated_at: "2026-01-01",
      suppress_when_silent: false,
      chat_mode: "shared",
    },
  ]);
  const content = composeSkillMd({
    name: "Search",
    description: "Search",
    content: "Search",
    createdIsoDate: "2026-01-01",
  });
  await vfs.writeText(skillKey(root, "search"), content);
  await vfs.writeText(
    skillKeyInDir(sharedSkillsDirKey(paths.sharedRoot(ws)), "shared"),
    content,
  );
  const directory = localEntityDirectory({
    store,
    vfs,
    paths,
    workspaceId: ws.id,
    agentId: assistant.id,
  });
  expect((await directory.agents()).map((a) => a.agent.id)).toEqual([agent.id]);
  expect(await directory.workspaces()).toEqual([{ id: ws.id, name: ws.name }]);
  expect(await directory.routines(agent.id)).toEqual([
    { id: "r", name: "Morning" },
  ]);
  expect(await directory.activities(agent.id)).toEqual([
    { id: "a", name: "Research" },
  ]);
  expect(await directory.skills(agent.id)).toEqual([
    { slug: "search", name: "search" },
  ]);
  expect(await directory.sharedSkills(ws.id)).toEqual([
    { slug: "shared", name: "shared" },
  ]);
  expect(await directory.teams()).toEqual([]);
  expect(await directory.members()).toEqual([]);
  expect(await directory.invites()).toEqual([]);
  await expect(directory.activities(foreign.id)).rejects.toThrow();
  await expect(directory.sharedSkills(outsider.id)).rejects.toThrow();
  await saveActivities(vfs, root, [
    { id: "b", title: "New", description: "", status: "done" },
  ]);
  expect(await directory.activities(agent.id)).toEqual([
    { id: "b", name: "New" },
  ]);
});
