import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { prepareTurnFilesystem } from "./turn-filesystem";

test("route-op excludes skip the runtime tree wherever the agent sits", async () => {
  const storeRoot = mkdtempSync(join(tmpdir(), "op-hydrate-"));
  const prefix = "ws/w1/agent-1";
  const agent = join(storeRoot, prefix, "workspaces", "Personal", "Bob");
  mkdirSync(join(agent, ".houston", "runtime", "conversations"), {
    recursive: true,
  });
  mkdirSync(join(agent, ".houston", "routines"), { recursive: true });
  writeFileSync(join(agent, "CLAUDE.md"), "# Bob\n");
  writeFileSync(join(agent, "report.csv"), "a,b\n");
  writeFileSync(join(agent, ".houston", "routines", "routines.json"), "[]");
  writeFileSync(
    join(agent, ".houston", "runtime", "conversations", "c1.json"),
    "{}",
  );
  writeFileSync(join(agent, ".houston", "runtime", "settings.json"), "{}");

  const root = mkdtempSync(join(tmpdir(), "op-root-"));
  const fs = await prepareTurnFilesystem({
    store: new LocalDirStore(storeRoot),
    prefix,
    root,
    claimed: true,
    excludes: ["workspaces/*/*/.houston/runtime/"],
  });
  const hydrated = JSON.stringify([...fs.manifest.keys()].sort());
  expect(hydrated).toContain("report.csv");
  expect(hydrated).toContain("routines.json");
  expect(hydrated).not.toContain("runtime/conversations/c1.json");
  expect(hydrated).not.toContain("runtime/settings.json");
  expect(
    existsSync(
      join(fs.workspaceDir, ".houston", "runtime", "conversations", "c1.json"),
    ),
  ).toBe(false);
  expect(existsSync(join(fs.workspaceDir, "report.csv"))).toBe(true);
});
