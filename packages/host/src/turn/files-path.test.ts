import { expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { MemoryVfs } from "../vfs";
import { handleFiles } from "./files";
import { FilePathError, safeRel, workspaceRel } from "./files-path";

/**
 * `workspaceRel`: the host-side strip of engine-emitted ABSOLUTE paths down to
 * workspace-relative. Agents drop their own working directory's absolute path
 * into chat links (`/data/workspaces/W/A/x.md` on pods); cloud clients can't
 * strip it (their agent key is an opaque id), so the host must (PRODUCT-1575).
 */

// The pod/local layout root the strip keys on (`<Workspace>/<Agent>`).
const ROOT = "Personal/Marketing Manager";

test("strips a pod absolute path down to workspace-relative", () => {
  expect(
    workspaceRel(
      ROOT,
      "/data/workspaces/Personal/Marketing Manager/uploads/report.html",
    ),
  ).toBe("uploads/report.html");
  // Desktop macOS shape.
  expect(
    workspaceRel(
      ROOT,
      "/Users/jo/.houston/workspaces/Personal/Marketing Manager/deck.pptx",
    ),
  ).toBe("deck.pptx");
});

test("strips Windows absolute paths, with or without a mangled leading slash", () => {
  expect(
    workspaceRel(
      ROOT,
      "C:\\Users\\jo\\.houston\\workspaces\\Personal\\Marketing Manager\\plan.md",
    ),
  ).toBe("plan.md");
  // Markdown href normalization can prefix the drive with a slash.
  expect(
    workspaceRel(
      ROOT,
      "/C:/Users/jo/.houston/workspaces/Personal/Marketing Manager/plan.md",
    ),
  ).toBe("plan.md");
});

test("relative paths pass through workspaceRel unchanged (same wall as safeRel)", () => {
  expect(workspaceRel(ROOT, "uploads/report.html")).toBe(
    safeRel("uploads/report.html"),
  );
});

test("absolute path outside the workspace is still rejected", () => {
  expect(() => workspaceRel(ROOT, "/etc/passwd")).toThrow(FilePathError);
  expect(() =>
    workspaceRel(ROOT, "/data/workspaces/Personal/Other Agent/x.md"),
  ).toThrow(FilePathError);
});

test("stripped remainder still hits the traversal + dot-dir wall", () => {
  expect(() =>
    workspaceRel(
      ROOT,
      "/data/workspaces/Personal/Marketing Manager/../Other Agent/x.md",
    ),
  ).toThrow(FilePathError);
  expect(() =>
    workspaceRel(
      ROOT,
      "/data/workspaces/Personal/Marketing Manager/.houston/runtime/auth.json",
    ),
  ).toThrow(FilePathError);
});

test("download route accepts the absolute path an agent linked in chat", async () => {
  const objects = new MemoryVfs();
  await objects.writeText(`${ROOT}/uploads/report.html`, "<html>ok</html>");
  const paths = { agentRoot: () => ROOT } as unknown as WorkspacePaths;
  const ctx = { workspace: {} as Workspace, agent: {} as Agent };

  const state = {
    status: 0,
    headers: {} as Record<string, unknown>,
    body: null as Buffer | null,
  };
  const res = {
    writeHead(code: number, h?: Record<string, unknown>) {
      state.status = code;
      if (h) Object.assign(state.headers, h);
      return this;
    },
    end(buf?: Buffer | string) {
      if (buf !== undefined)
        state.body = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    },
  };

  await handleFiles(
    objects,
    paths,
    ctx,
    "GET",
    "files/download",
    { url: "/x" } as never,
    res as never,
    new URLSearchParams({
      path: "/data/workspaces/Personal/Marketing Manager/uploads/report.html",
    }),
  );
  expect(state.status).toBe(200);
  expect(state.body?.toString("utf8")).toBe("<html>ok</html>");
  expect(String(state.headers["Content-Disposition"])).toContain("report.html");
});
