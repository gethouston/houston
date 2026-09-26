import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const app = read("../src/App.tsx");
const workspace = read("../src/app-workspace.tsx");

describe("App's workspace wiring", () => {
  it("starts the rail order read above the splash's early returns", () => {
    const call = app.indexOf("useWorkspaceBootReads();");
    assert.notEqual(call, -1, "App must start the boot reads");
    assert.ok(call < app.indexOf("return <WorkspaceLoading />"));
    assert.match(workspace, /useSidebarLayoutReady\(workspaceId\)/);
  });

  it("mounts the team move host beside the shell, never in App itself", () => {
    assert.ok(!app.includes("TeamMoveHost"));
    assert.match(workspace, /<WorkspaceShell[\s\S]*?<TeamMoveHost \/>/);
  });
});
