import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRoutine } from "@houston/domain";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test, vi } from "vitest";
import { createTurnServer } from "./server";
import type { TurnRunner } from "./turn-session";
import { TURN_SETUP_MESSAGES } from "./turn-terminal";

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

const PRIME = [
  "workspaces/Personal/prime/CLAUDE.md",
  "workspaces/Personal/prime/.houston/activity/activity.json",
];
const STRAY = [
  "workspaces/ws/Personal/preferences.json",
  "workspaces/ws/Personal/.houston/runtime/models-store.json",
  "workspaces/ws/Personal/.houston/runtime/bin/claude-shell-fence",
];

interface TurnlogPost {
  url: string;
  body: { seq: number; frame: Record<string, unknown> }[];
}

async function claimedTurn(
  rels: string[],
  runTurn: TurnRunner,
  extra: Record<string, unknown> = {},
  contents: Record<string, string> = {},
) {
  const storeRoot = await mkdtemp(join(tmpdir(), "turn-setup-turnlog-"));
  for (const rel of rels) {
    const path = join(storeRoot, "ws", "o1", "a1", ...rel.split("/"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents[rel] ?? "x");
  }
  const turnlog: TurnlogPost[] = [];
  const fetched: string[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    fetched.push(url);
    if (url.includes("/v1/pod/turnlog/")) {
      turnlog.push({
        url,
        body: JSON.parse(String(init?.body)) as TurnlogPost["body"],
      });
    }
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  const server = createTurnServer({
    store: new LocalDirStore(storeRoot),
    token: "",
    runTurn,
    turnLogUrl: "https://gateway.test",
    fetchImpl,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  const response = await fetch(`http://127.0.0.1:${address.port}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId: "o1",
      agentId: "a1",
      conversationId: "c1",
      text: "hello",
      gcsPrefix: "ws/o1/a1",
      credential: {
        provider: "openai-codex",
        access: "token",
        expires: Date.now() + 60_000,
      },
      hostToken: "host-token",
      turnlogSeqStart: 7,
      claim: {
        id: "claim-1",
        bootId: "boot-1",
        token: "claim-token",
        heartbeatUrl: "https://gateway.test/v1/pool/claims/heartbeat",
      },
      ...extra,
    }),
  });
  const frames = (await response.text())
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
  return { frames, turnlog, storeRoot, fetched };
}

test("a stray non-agent folder in the store does not fail the turn", async () => {
  const runTurn = vi.fn<TurnRunner>(async () => ({}));
  const { frames } = await claimedTurn([...PRIME, ...STRAY], runTurn);

  expect(frames.find((frame) => frame.type === "error")).toBeUndefined();
  expect(runTurn).toHaveBeenCalledTimes(1);
  expect(runTurn.mock.calls[0]?.[0].workspaceDir).toMatch(
    /workspaces[/\\]Personal[/\\]prime$/,
  );
});

test("a setup failure posts a terminal error frame to the turnlog first", async () => {
  const runTurn = vi.fn<TurnRunner>();
  const { frames, turnlog } = await claimedTurn(
    [...PRIME, "workspaces/Personal/other/CLAUDE.md"],
    runTurn,
  );

  const expected = {
    type: "error",
    seq: 7,
    data: {
      message: TURN_SETUP_MESSAGES.layout_unexpected,
      code: "layout_unexpected",
    },
  };
  expect(runTurn).not.toHaveBeenCalled();
  expect(frames.at(-1)).toMatchObject(expected);
  expect(turnlog).toHaveLength(1);
  expect(turnlog[0]?.url).toBe("https://gateway.test/v1/pod/turnlog/o1/a1/c1");
  expect(turnlog[0]?.body).toHaveLength(1);
  expect(turnlog[0]?.body[0]).toMatchObject({ seq: 7, frame: expected });
});

test("a claimed turn over a flat-layout agent fails setup before any provider work", async () => {
  const runTurn = vi.fn<TurnRunner>();
  const { frames } = await claimedTurn(
    [
      "workspaces/Personal/prime/CLAUDE.md",
      "workspaces/Personal/prime/.houston/activity.json",
    ],
    runTurn,
  );

  expect(runTurn).not.toHaveBeenCalled();
  expect(frames.at(-1)).toMatchObject({
    type: "error",
    data: {
      message: TURN_SETUP_MESSAGES.agent_not_migrated,
      code: "agent_not_migrated",
    },
  });
});

test("a pooled routine run over a flat-layout agent writes no running row", async () => {
  const runTurn = vi.fn<TurnRunner>();
  const routines = "workspaces/Personal/prime/.houston/routines/routines.json";
  const { frames, storeRoot, fetched } = await claimedTurn(
    [
      "workspaces/Personal/prime/CLAUDE.md",
      "workspaces/Personal/prime/.houston/activity/activity.json",
      routines,
      "workspaces/Personal/prime/.houston/routine_runs.json",
    ],
    runTurn,
    { routine: { id: "r1" }, text: "" },
    {
      [routines]: JSON.stringify([
        createRoutine(
          { name: "Digest", prompt: "check", schedule: "0 9 * * *" },
          "r1",
          "2026-09-29T10:00:00.000Z",
        ),
      ]),
    },
  );

  expect(runTurn).not.toHaveBeenCalled();
  expect(frames.at(-1)).toMatchObject({
    type: "error",
    data: { code: "agent_not_migrated" },
  });
  const runs = join(
    storeRoot,
    "ws/o1/a1/workspaces/Personal/prime/.houston/routine_runs/routine_runs.json",
  );
  await expect(access(runs)).rejects.toThrow();
  expect(fetched.filter((url) => url.includes("routine_runs"))).toEqual([]);
});
