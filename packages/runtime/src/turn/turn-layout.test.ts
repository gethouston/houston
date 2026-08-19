import { access, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { resolveTurnLayout, type TurnSetupError } from "./turn-layout";

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
