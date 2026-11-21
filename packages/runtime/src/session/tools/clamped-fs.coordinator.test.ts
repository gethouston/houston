import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fileToolGuardOptions } from "../coordinator-policy";
import { makeClampedFileTools } from "./clamped-fs";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const workspace = join(
  realpathSync(mkdtempSync(join(tmpdir(), "houston-coord-tools-"))),
  ".assistant",
);
mkdirSync(workspace);
const tools = new Map(
  makeClampedFileTools(
    workspace,
    fileToolGuardOptions({
      role: "coordinator",
      workspaceDir: workspace,
      sharedSkillsDir: "",
    }),
  ).map((tool) => [tool.name, tool]),
);
const uploads = join(workspace, "uploads");
mkdirSync(uploads);
writeFileSync(join(uploads, "image.png"), PNG);

const exec = (name: string, params: Record<string, unknown>) => {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.execute(
    "call-1",
    params as Parameters<typeof tool.execute>[1],
    undefined,
    undefined,
    {} as Parameters<typeof tool.execute>[4],
  );
};

test("read returns an attached photo as an image the model can see", async () => {
  const result = await exec("read", { path: "uploads/image.png" });
  expect(result.content).toContainEqual(
    expect.objectContaining({ type: "image", mimeType: "image/png" }),
  );
});

test("write cannot replace or add an attachment", async () => {
  await expect(
    exec("write", { path: "uploads/image.png", content: "tampered" }),
  ).rejects.toThrow("kept exactly as it arrived");
  await expect(
    exec("write", { path: "uploads/new.md", content: "x" }),
  ).rejects.toThrow("kept exactly as it arrived");
  expect(readFileSync(join(uploads, "image.png"))).toEqual(PNG);
});

test("read outside the folder still meets the narrowed wall", async () => {
  writeFileSync(join(workspace, "WORKSPACE.md"), "context");
  await expect(
    exec("read", { path: "uploads/../WORKSPACE.md" }),
  ).rejects.toThrow("You cannot open or change that");
});
