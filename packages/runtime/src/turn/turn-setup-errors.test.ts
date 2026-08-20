import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test, vi } from "vitest";
import { createTurnServer } from "./server";
import type { runPiTurn } from "./turn-session";

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function run(files: Record<string, string>, maxHydrateBytes?: number) {
  const storeRoot = await mkdtemp(join(tmpdir(), "turn-error-store-"));
  for (const [rel, value] of Object.entries(files)) {
    const path = join(storeRoot, "ws", "w1", "agent-1", ...rel.split("/"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, value);
  }
  const runTurn = vi.fn<typeof runPiTurn>();
  const server = createTurnServer({
    store: new LocalDirStore(storeRoot),
    token: "",
    runTurn,
    ...(maxHydrateBytes ? { maxHydrateBytes } : {}),
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  const response = await fetch(`http://127.0.0.1:${address.port}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId: "w1",
      agentId: "agent-1",
      conversationId: "c1",
      text: "hello",
      gcsPrefix: "ws/w1/agent-1",
      credential: {
        provider: "openai-codex",
        access: "token",
        expires: Date.now() + 60_000,
      },
    }),
  });
  const frame = (await response.text())
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>)
    .at(-1);
  return { frame, runTurn };
}

test("an ambiguous standing tree emits layout_unexpected before provider work", async () => {
  const result = await run({
    "workspaces/W/A/file.txt": "a",
    "workspaces/W/B/file.txt": "b",
  });
  expect(result.frame).toMatchObject({
    type: "error",
    data: { message: "layout_unexpected", code: "layout_unexpected" },
  });
  expect(result.runTurn).not.toHaveBeenCalled();
});

test("an over-cap hydrate emits hydrate_over_cap before provider work", async () => {
  const result = await run({ "workspace/big.txt": "too large" }, 2);
  expect(result.frame).toMatchObject({
    type: "error",
    data: { message: "hydrate_over_cap", code: "hydrate_over_cap" },
  });
  expect(result.runTurn).not.toHaveBeenCalled();
});
