import type { IncomingMessage, ServerResponse } from "node:http";
import { expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import { LocalPaths } from "../paths";
import { MemoryVfs } from "../vfs";
import { handleDocsData } from "./agent-data-docs";
import { handleAgentFile } from "./agent-file";

/**
 * The first-day fields of an agent's config are HOST-OWNED (codex 7, C4): a
 * surface writes the whole config after reading it, so a read taken before the
 * first day started (or before a hosted pod's seed landed) must not put the
 * start button back, or take it away for good. Both config write doors keep
 * what the stored config holds.
 */

const ws: Workspace = {
  id: "ws-1",
  ownerUserId: "alice",
  kind: "personal",
  name: "Personal",
  slug: "personal",
  runtime: "local",
  createdAt: 0,
};
const agent: Agent = {
  id: "Personal/Helper",
  workspaceId: "ws-1",
  name: "Helper",
  createdAt: 0,
};
const paths = new LocalPaths();
const CONFIG = ".houston/config/config.json";
const key = `${paths.agentRoot(ws, agent)}/${CONFIG}`;

function fakeReq(body: unknown): IncomingMessage {
  const buf = Buffer.from(JSON.stringify(body));
  return {
    async *[Symbol.asyncIterator]() {
      yield buf;
    },
  } as unknown as IncomingMessage;
}

function fakeRes(): ServerResponse {
  const res = {
    writeHead: () => res,
    end: () => undefined,
  };
  return res as unknown as ServerResponse;
}

async function rawWrite(vfs: MemoryVfs, config: unknown) {
  await handleAgentFile(
    vfs,
    paths,
    { workspace: ws, agent },
    "PUT",
    `agentfile/${CONFIG}`,
    fakeReq({ content: JSON.stringify(config) }),
    fakeRes(),
  );
}

async function typedWrite(vfs: MemoryVfs, config: unknown) {
  await handleDocsData(
    vfs,
    paths.agentRoot(ws, agent),
    "config",
    "PUT",
    null,
    fakeReq(config),
    fakeRes(),
    () => undefined,
  );
}

const stored = async (vfs: MemoryVfs) =>
  JSON.parse((await vfs.readText(key)) ?? "{}") as Record<string, unknown>;

for (const [door, write] of [
  ["agentfile", rawWrite],
  ["typed config", typedWrite],
] as const) {
  test(`${door}: a stale whole-config write keeps the started first day`, async () => {
    const vfs = new MemoryVfs();
    await vfs.writeText(key, JSON.stringify({ firstDay: "started" }));
    await write(vfs, { model: "m", firstDay: "pending" });
    expect(await stored(vfs)).toEqual({ model: "m", firstDay: "started" });
  });

  test(`${door}: a write read before the seed landed keeps the pending first day`, async () => {
    const vfs = new MemoryVfs();
    await vfs.writeText(
      key,
      JSON.stringify({ firstDay: "pending", arrival: "created" }),
    );
    await write(vfs, { model: "m" });
    expect(await stored(vfs)).toEqual({
      model: "m",
      firstDay: "pending",
      arrival: "created",
    });
  });
}

test("agentfile: any other document is written verbatim", async () => {
  const vfs = new MemoryVfs();
  await handleAgentFile(
    vfs,
    paths,
    { workspace: ws, agent },
    "PUT",
    "agentfile/.houston/learnings/learnings.json",
    fakeReq({ content: '{"firstDay":"pending"}' }),
    fakeRes(),
  );
  expect(
    await vfs.readText(
      `${paths.agentRoot(ws, agent)}/.houston/learnings/learnings.json`,
    ),
  ).toBe('{"firstDay":"pending"}');
});
