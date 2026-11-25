import type { AgentDelegation } from "@houston/protocol";
import { expect, test, vi } from "vitest";
import { MemoryVfs } from "../vfs";
import {
  delegationDocKey,
  moveAgentDelegation,
  pruneAgentDelegation,
  readAgentDelegation,
  writeAgentDelegation,
} from "./agent-delegation-store";

const picked = (agents: string[]): AgentDelegation => ({
  mode: "picked",
  agents,
  acceptsMissions: true,
});

test("an absent policy defaults on and a default write deletes its entry", async () => {
  const vfs = new MemoryVfs();
  const key = delegationDocKey("Personal");
  expect(await readAgentDelegation(vfs, "Personal", "Scout")).toEqual({
    mode: "all",
    agents: [],
    acceptsMissions: true,
  });
  await writeAgentDelegation(vfs, "Personal", "Scout", picked(["Writer"]));
  expect(await vfs.readText(key)).toContain("Scout");
  await writeAgentDelegation(vfs, "Personal", "Scout", {
    mode: "all",
    agents: [],
    acceptsMissions: true,
  });
  expect(await vfs.readText(key)).toBeNull();
});

test.each(["{broken", '{"version":2,"agents":{}}'])(
  "corrupt document %s recovers without opening neighbouring agents",
  async (contents) => {
    const vfs = new MemoryVfs();
    const key = delegationDocKey("Personal");
    await vfs.writeText(key, contents);
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await readAgentDelegation(vfs, "Personal", "Scout")).toEqual({
        mode: "off",
        agents: [],
        acceptsMissions: false,
      });
      await writeAgentDelegation(vfs, "Personal", "Scout", picked(["Writer"]), [
        "Scout",
        "Writer",
      ]);
      expect(await readAgentDelegation(vfs, "Personal", "Scout")).toEqual(
        picked(["Writer"]),
      );
      expect(await readAgentDelegation(vfs, "Personal", "Writer")).toEqual({
        mode: "off",
        agents: [],
        acceptsMissions: false,
      });
      const backup = (await vfs.list("Personal")).find((item) =>
        item.includes(".agent-delegation.corrupt-"),
      );
      expect(backup).toBeDefined();
      expect(await vfs.readText(backup ?? "missing")).toBe(contents);
      expect(report).toHaveBeenCalledWith(
        expect.stringContaining(key),
        expect.any(Error),
      );
    } finally {
      report.mockRestore();
    }
  },
);

test("move and prune preserve untouched policy bytes", async () => {
  const vfs = new MemoryVfs();
  const key = delegationDocKey("Personal");
  const neighbour = '"Future"  : { "future" : [ 1, {"x":true} ] }';
  await vfs.writeText(
    key,
    `{"version":1,"agents":{${neighbour},"Scout":{"mode":"off","agents":[],"acceptsMissions":false}}}`,
  );
  await moveAgentDelegation(vfs, "Personal", "Scout", "Writer");
  expect(await vfs.readText(key)).toContain(neighbour);
  await pruneAgentDelegation(vfs, "Personal", "Writer");
  expect(await vfs.readText(key)).toContain(neighbour);
});

test("writes replace the last duplicate key used by JSON.parse", async () => {
  const vfs = new MemoryVfs();
  const key = delegationDocKey("Personal");
  await vfs.writeText(
    key,
    '{"version":1,"agents":{"Scout":{"mode":"off","agents":[],"acceptsMissions":false},"Scout":{"mode":"all","agents":[],"acceptsMissions":true}}}',
  );
  await writeAgentDelegation(vfs, "Personal", "Scout", picked(["Writer"]));
  expect(await readAgentDelegation(vfs, "Personal", "Scout")).toEqual(
    picked(["Writer"]),
  );
});

test("deleting a duplicated policy removes every effective copy", async () => {
  const vfs = new MemoryVfs();
  const key = delegationDocKey("Personal");
  await vfs.writeText(
    key,
    '{"version":1,"agents":{"Writer":{"mode":"off","agents":[],"acceptsMissions":false},"Scout":{"mode":"off","agents":[],"acceptsMissions":false},"Scout":{"mode":"picked","agents":["Writer"],"acceptsMissions":true}}}',
  );
  await writeAgentDelegation(vfs, "Personal", "Scout", {
    mode: "all",
    agents: [],
    acceptsMissions: true,
  });
  expect(await readAgentDelegation(vfs, "Personal", "Scout")).toEqual({
    mode: "all",
    agents: [],
    acceptsMissions: true,
  });
});

test("invalid entry reads closed and survives unrelated writes until replaced", async () => {
  const vfs = new MemoryVfs();
  const key = delegationDocKey("Personal");
  const invalidEntry =
    '"Broken"  :  { "mode" : "picked", "agents" : "Writer", "acceptsMissions" : true }';
  await vfs.writeText(
    key,
    `{"version":1,"agents":{"Scout":{"mode":"off","agents":[],"acceptsMissions":false},${invalidEntry}}}`,
  );
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await readAgentDelegation(vfs, "Personal", "Scout")).toEqual({
      mode: "off",
      agents: [],
      acceptsMissions: false,
    });
    expect(await readAgentDelegation(vfs, "Personal", "Broken")).toEqual({
      mode: "off",
      agents: [],
      acceptsMissions: false,
    });
    await writeAgentDelegation(vfs, "Personal", "Writer", picked(["Scout"]));
    expect(await vfs.readText(key)).toContain(invalidEntry);
    const stored = JSON.parse((await vfs.readText(key)) ?? "null") as {
      agents: Record<string, unknown>;
    };
    expect(stored.agents.Broken).toEqual({
      mode: "picked",
      agents: "Writer",
      acceptsMissions: true,
    });
    expect(await readAgentDelegation(vfs, "Personal", "Scout")).toEqual({
      mode: "off",
      agents: [],
      acceptsMissions: false,
    });
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining("Broken"),
      expect.any(Error),
    );
    await writeAgentDelegation(vfs, "Personal", "Writer", {
      mode: "all",
      agents: [],
      acceptsMissions: true,
    });
    expect(await vfs.readText(key)).toContain(invalidEntry);
    await writeAgentDelegation(vfs, "Personal", "Broken", picked(["Writer"]));
    expect(await vfs.readText(key)).not.toContain(invalidEntry);
    expect(await readAgentDelegation(vfs, "Personal", "Broken")).toEqual(
      picked(["Writer"]),
    );
  } finally {
    report.mockRestore();
  }
});

test("storage read failures propagate rather than being treated as corrupt policy", async () => {
  const vfs = new MemoryVfs();
  vi.spyOn(vfs, "readText").mockRejectedValueOnce(new Error("storage offline"));
  await expect(readAgentDelegation(vfs, "Personal", "Scout")).rejects.toThrow(
    "storage offline",
  );
});

test("rename moves the policy and rewrites every picked reference", async () => {
  const vfs = new MemoryVfs();
  await writeAgentDelegation(vfs, "Personal", "Scout", picked(["Writer"]));
  await writeAgentDelegation(
    vfs,
    "Personal",
    "Writer",
    picked(["Scout", "Editor"]),
  );
  await moveAgentDelegation(vfs, "Personal", "Scout", "Researcher");
  expect(await readAgentDelegation(vfs, "Personal", "Scout")).toEqual({
    mode: "all",
    agents: [],
    acceptsMissions: true,
  });
  expect(await readAgentDelegation(vfs, "Personal", "Researcher")).toEqual(
    picked(["Writer"]),
  );
  expect(await readAgentDelegation(vfs, "Personal", "Writer")).toEqual(
    picked(["Researcher", "Editor"]),
  );
});

test("delete removes the policy and picked references", async () => {
  const vfs = new MemoryVfs();
  await writeAgentDelegation(vfs, "Personal", "Scout", picked(["Writer"]));
  await writeAgentDelegation(vfs, "Personal", "Writer", picked(["Scout"]));
  await pruneAgentDelegation(vfs, "Personal", "Scout");
  expect(await readAgentDelegation(vfs, "Personal", "Scout")).toEqual({
    mode: "all",
    agents: [],
    acceptsMissions: true,
  });
  expect(await readAgentDelegation(vfs, "Personal", "Writer")).toEqual(
    picked([]),
  );
});
