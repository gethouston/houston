import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ChatMessage, Routine, RoutineRun } from "@houston/protocol";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
import {
  fakePoolStore,
  HEARTBEAT_URL,
  POOL_STORE_URL,
} from "./pool-store.test-support";
import { createTurnServer } from "./server";
import type { TurnRunner } from "./turn-session";

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

const noopTurn: TurnRunner = async () => ({});
const PREFIX = "ws/acme/bob";
const AGENT = "workspaces/Personal/Bob";
const RUNTIME = `${AGENT}/.houston/runtime`;
const RUNS = `${AGENT}/.houston/routine_runs/routine_runs.json`;
const STARTED = Date.parse("2026-06-12T12:00:00.000Z");

const routine: Routine = {
  id: "r1",
  name: "Daily digest",
  prompt: "Check the inbox",
  schedule: "0 9 * * *",
  enabled: true,
  suppress_when_silent: false,
  chat_mode: "shared",
  provider: null,
  model: null,
  effort: null,
  integrations: [],
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
};

const finishedRun: RoutineRun = {
  id: "p0",
  routine_id: "r1",
  status: "surfaced",
  session_key: "routine-r1",
  started_at: "2026-06-11T09:00:00.000Z",
  completed_at: "2026-06-11T09:01:00.000Z",
  summary: "Two new invoices.",
};

const userOf = (turnId: string, ts: number): ChatMessage => ({
  role: "user",
  content: "Check the inbox",
  ts,
  turnId,
});

const conversation = (id: string, messages: unknown[]) =>
  JSON.stringify({
    id,
    title: "Daily digest",
    createdAt: 1,
    updatedAt: 2,
    messages,
  });

const earlier = [
  userOf("p0", STARTED - 86_400_000),
  {
    role: "assistant",
    content: "Two new invoices.",
    ts: STARTED - 86_400_000 + 1000,
    turnId: "p0",
  },
];

interface DocCall {
  method: string;
  family: string;
  body: string;
}

async function worker(seed: {
  runs?: RoutineRun[];
  chats?: Record<string, unknown[]>;
}) {
  const pool = fakePoolStore(PREFIX);
  pool.put(`${AGENT}/CLAUDE.md`, "# Bob\n");
  pool.put(
    `${AGENT}/.houston/routines/routines.json`,
    JSON.stringify([routine]),
  );
  pool.put(RUNS, JSON.stringify(seed.runs ?? [finishedRun]));
  for (const [cid, messages] of Object.entries(seed.chats ?? {}))
    pool.put(
      `${RUNTIME}/conversations/${cid}.json`,
      conversation(cid, messages),
    );
  const docs: DocCall[] = [];
  let failReply = false;
  let failRoutinesPut = false;
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (failReply && path.endsWith("/assistant")) {
      failReply = false;
      return Response.json({ error: "boom" }, { status: 500 });
    }
    if (
      failRoutinesPut &&
      init?.method === "PUT" &&
      path.endsWith("routines.json")
    ) {
      failRoutinesPut = false;
      return Response.json({ error: "boom" }, { status: 500 });
    }
    if (path.startsWith("/v1/pod/docs/"))
      docs.push({
        method: init?.method ?? "GET",
        family: path.split("/").at(-1) ?? "",
        body: typeof init?.body === "string" ? init.body : "",
      });
    return pool.fetchImpl(input as string, init);
  }) as typeof fetch;
  const server = createTurnServer({
    store: new LocalDirStore(pool.root),
    token: "",
    runTurn: noopTurn,
    poolStoreUrl: POOL_STORE_URL,
    fetchImpl,
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const reconcile = async (op: Record<string, unknown>) => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`${base}/op`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "acme",
          agentId: "bob",
          gcsPrefix: PREFIX,
          hostToken: "host-token",
          claim: {
            id: "claim-1",
            bootId: "boot-1",
            token: "claim-token",
            heartbeatUrl: HEARTBEAT_URL,
          },
          triggersEnabled: false,
          op: { kind: "reconcile", ...op },
        }),
      });
      const json = (await response.json()) as Record<string, unknown>;
      if (json.error !== "worker_full" || attempt > 40) return json;
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  const runs = () => JSON.parse(pool.read(RUNS)) as RoutineRun[];
  const chat = (cid: string) =>
    (
      JSON.parse(pool.read(`${RUNTIME}/conversations/${cid}.json`)) as {
        messages: ChatMessage[];
      }
    ).messages;
  const assistantPuts = () =>
    pool.transcripts.filter((t) => t.path.endsWith("/assistant"));
  const failNextReply = () => {
    failReply = true;
  };
  const failNextPause = () => {
    failRoutinesPut = true;
  };
  return {
    pool,
    docs,
    reconcile,
    runs,
    chat,
    assistantPuts,
    failNextReply,
    failNextPause,
  };
}

const abandonedFire = (userMessage?: ChatMessage) => ({
  conversationId: "routine-r1",
  abandoned: {
    turnId: "t1",
    startedAt: new Date(STARTED).toISOString(),
    routine: true,
    ...(userMessage ? { userMessage } : {}),
  },
});

test("a routine fire whose sandbox died settles its run and its chat once, and a retry changes nothing", async () => {
  const w = await worker({ chats: { "routine-r1": earlier } });
  const op = abandonedFire(userOf("t1", STARTED));

  const json = await w.reconcile(op);

  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(json.events).toEqual(
    expect.arrayContaining(["RoutineRunsChanged", "ConversationsChanged"]),
  );
  const settled = w.runs().find((r) => r.id === "t1");
  expect(settled).toMatchObject({
    routine_id: "r1",
    status: "error",
    session_key: "routine-r1",
    started_at: new Date(STARTED).toISOString(),
    summary: "The routine was interrupted before it finished.",
  });
  expect(w.runs().find((r) => r.id === "p0")).toEqual(finishedRun);
  const tail = w.chat("routine-r1").slice(-2);
  expect(tail[0]).toEqual(userOf("t1", STARTED));
  expect(tail[1]).toMatchObject({
    role: "assistant",
    content: "",
    turnId: "t1",
    interrupted: { cause: "engine_restart" },
  });
  expect(w.assistantPuts()).toHaveLength(1);
  expect(w.assistantPuts()[0]?.path).toBe(
    "/v1/pod/transcripts/acme/bob/conversations/routine-r1/turns/t1/assistant",
  );
  expect(JSON.parse(w.assistantPuts()[0]?.body ?? "{}").message).toEqual(
    tail[1],
  );
  const runsDoc = w.docs.filter(
    (d) => d.family === "routine_runs" && d.method === "PUT",
  );
  expect(runsDoc).toHaveLength(1);
  expect(JSON.parse(runsDoc[0]?.body ?? "{}").doc).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: "t1" })]),
  );
  expect(w.pool.writes.map((write) => write.claim)).toEqual(
    w.pool.writes.map(() => "routine-r1"),
  );

  const writesBefore = w.pool.writes.length;
  const again = await w.reconcile(op);
  expect(again.status, JSON.stringify(again)).toBe(200);
  expect(again.events).toEqual([]);
  expect(w.pool.writes).toHaveLength(writesBefore);
  expect(
    w.chat("routine-r1").filter((m) => m.interrupted !== undefined),
  ).toHaveLength(1);
  expect(w.assistantPuts().map((p) => p.body)).toEqual([
    w.assistantPuts()[0]?.body,
    w.assistantPuts()[0]?.body,
  ]);
});

test("an attempt whose projection fails declines, and the retry finishes it", async () => {
  const w = await worker({ chats: { "routine-r1": earlier } });
  w.failNextReply();
  const op = abandonedFire(userOf("t1", STARTED));

  const first = await w.reconcile(op);
  expect(first.decline, JSON.stringify(first)).toBe(true);
  expect(w.runs().find((r) => r.id === "t1")?.status).toBe("error");

  const second = await w.reconcile(op);
  expect(second.status, JSON.stringify(second)).toBe(200);
  expect(w.assistantPuts().at(-1)?.path).toContain("/turns/t1/assistant");
  expect(
    w.docs.filter((d) => d.family === "routine_runs" && d.method === "PUT"),
  ).toHaveLength(2);
});

test("a chat turn that died gets one interruption reply and no run row", async () => {
  const w = await worker({ chats: { c1: earlier } });

  const json = await w.reconcile({
    conversationId: "c1",
    abandoned: {
      turnId: "t9",
      startedAt: new Date(STARTED).toISOString(),
      routine: false,
      userMessage: userOf("t9", STARTED),
    },
  });

  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(json.events).toEqual(["ConversationsChanged"]);
  expect(w.chat("c1").map((m) => [m.role, m.turnId])).toEqual([
    ["user", "p0"],
    ["assistant", "p0"],
    ["user", "t9"],
    ["assistant", "t9"],
  ]);
  expect(w.runs()).toEqual([finishedRun]);
  expect(w.assistantPuts()).toHaveLength(1);
});

test("the first message of a chat that never synced creates the chat with its reply", async () => {
  const w = await worker({});

  await w.reconcile({
    conversationId: "c2",
    abandoned: {
      turnId: "t2",
      startedAt: new Date(STARTED).toISOString(),
      routine: false,
      userMessage: userOf("t2", STARTED),
    },
  });

  const messages = w.chat("c2");
  expect(messages).toHaveLength(2);
  expect(messages[0]).toEqual(userOf("t2", STARTED));
  expect(messages[1]?.interrupted).toEqual({ cause: "engine_restart" });
});

test("a turn that finished before its claim was lost is never touched", async () => {
  const done: RoutineRun = {
    ...finishedRun,
    id: "t1",
    started_at: new Date(STARTED).toISOString(),
  };
  const w = await worker({
    runs: [done, finishedRun],
    chats: {
      "routine-r1": [
        ...earlier,
        userOf("t1", STARTED),
        { role: "assistant", content: "Done.", ts: STARTED + 5, turnId: "t1" },
      ],
    },
  });

  const json = await w.reconcile(abandonedFire(userOf("t1", STARTED)));

  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(json.events).toEqual([]);
  expect(w.pool.writes).toEqual([]);
  expect(w.assistantPuts()).toEqual([]);
  expect(w.runs()).toEqual([done, finishedRun]);
});

test("a chat that moved on past the dead turn gets no line out of order, but the run still settles", async () => {
  const w = await worker({
    chats: {
      "routine-r1": [
        ...earlier,
        userOf("t3", STARTED + 60_000),
        {
          role: "assistant",
          content: "Later answer.",
          ts: STARTED + 61_000,
          turnId: "t3",
        },
      ],
    },
  });

  const json = await w.reconcile(abandonedFire(userOf("t1", STARTED)));

  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(json.events).toEqual(["RoutineRunsChanged"]);
  expect(w.chat("routine-r1").some((m) => m.turnId === "t1")).toBe(false);
  expect(w.assistantPuts()).toEqual([]);
  expect(w.runs().find((r) => r.id === "t1")?.status).toBe("error");
});

test("a fire that never reached its user message still settles its run", async () => {
  const w = await worker({ chats: { "routine-r1": earlier } });

  const json = await w.reconcile(abandonedFire());

  expect(json.events).toEqual(["RoutineRunsChanged"]);
  expect(w.chat("routine-r1")).toEqual(earlier);
  expect(w.runs().find((r) => r.id === "t1")?.summary).toBe(
    "The routine was interrupted before it finished.",
  );
});

test("a stale running row with no turn named settles as the pod's reconcile would", async () => {
  const stale: RoutineRun = {
    id: "pod-run",
    routine_id: "r1",
    status: "running",
    session_key: "routine-r1",
    started_at: "2026-06-11T09:00:00.000Z",
  };
  const w = await worker({ runs: [stale], chats: { "routine-r1": [] } });

  const json = await w.reconcile({ conversationId: "routine-r1" });

  expect(json.events).toEqual(["RoutineRunsChanged"]);
  expect(w.runs()[0]).toMatchObject({
    id: "pod-run",
    status: "error",
    summary: "The routine timed out without a response.",
  });
});

test("a run that failed on a credential wall completes its streak and pauses the routine", async () => {
  const walls: RoutineRun[] = Array.from({ length: 9 }, (_, i) => ({
    id: `w${i}`,
    routine_id: "r1",
    status: "error",
    session_key: "routine-r1",
    started_at: new Date(STARTED - (i + 1) * 3_600_000).toISOString(),
    completed_at: new Date(
      STARTED - (i + 1) * 3_600_000 + 60_000,
    ).toISOString(),
    failure: { code: "out_of_credits", provider: "anthropic" },
  }));
  const stale: RoutineRun = {
    id: "t1",
    routine_id: "r1",
    status: "running",
    session_key: "routine-r1",
    started_at: new Date(STARTED).toISOString(),
  };
  const w = await worker({
    runs: [stale, ...walls],
    chats: {
      "routine-r1": [
        userOf("t1", STARTED),
        {
          role: "assistant",
          content: "",
          ts: STARTED + 1000,
          turnId: "t1",
          providerError: {
            kind: "quota_exhausted",
            provider: "anthropic",
            message: "credit balance too low",
          },
        },
      ],
    },
  });
  w.pool.put(
    `${AGENT}/.houston/routines/routines.json`,
    JSON.stringify([{ ...routine, name: "Renamed digest" }]),
  );

  const json = await w.reconcile({ conversationId: "routine-r1" });

  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(json.events).toEqual(
    expect.arrayContaining(["RoutineRunsChanged", "RoutinesChanged"]),
  );
  const [saved] = JSON.parse(
    w.pool.read(`${AGENT}/.houston/routines/routines.json`),
  ) as Routine[];
  expect(saved).toMatchObject({ name: "Renamed digest", enabled: false });
  expect(saved?.auto_paused?.reason).toBe("out_of_credits");
});

test("a chat whose file already ends with the dead turn's message settles from the file alone", async () => {
  const w = await worker({
    chats: { c3: [...earlier, userOf("t3", STARTED)] },
  });

  const json = await w.reconcile({
    conversationId: "c3",
    abandoned: {
      turnId: "t3",
      startedAt: new Date(STARTED).toISOString(),
      routine: false,
    },
  });

  expect(json.events, JSON.stringify(json)).toEqual(["ConversationsChanged"]);
  const tail = w.chat("c3").slice(-2);
  expect(tail[0]).toEqual(userOf("t3", STARTED));
  expect(tail[1]?.interrupted).toEqual({ cause: "engine_restart" });
});

test("a pause that fails declines the attempt, and the retry pauses", async () => {
  const walls: RoutineRun[] = Array.from({ length: 10 }, (_, i) => ({
    id: i === 0 ? "t1" : `w${i}`,
    routine_id: "r1",
    status: "error",
    session_key: "routine-r1",
    started_at: new Date(STARTED - i * 3_600_000).toISOString(),
    completed_at: new Date(STARTED - i * 3_600_000 + 60_000).toISOString(),
    failure: { code: "out_of_credits", provider: "anthropic" },
  }));
  const w = await worker({ runs: walls, chats: { "routine-r1": earlier } });
  w.failNextPause();

  const first = await w.reconcile(abandonedFire());
  expect(first.decline, JSON.stringify(first)).toBe(true);

  const second = await w.reconcile(abandonedFire());
  expect(second.events, JSON.stringify(second)).toEqual(["RoutinesChanged"]);
  const [saved] = JSON.parse(
    w.pool.read(`${AGENT}/.houston/routines/routines.json`),
  ) as Routine[];
  expect(saved?.enabled).toBe(false);
});

test("a pause the settling attempt never reached is owed by the retry", async () => {
  const walls: RoutineRun[] = Array.from({ length: 10 }, (_, i) => ({
    id: i === 0 ? "t1" : `w${i}`,
    routine_id: "r1",
    status: "error",
    session_key: "routine-r1",
    started_at: new Date(STARTED - i * 3_600_000).toISOString(),
    completed_at: new Date(STARTED - i * 3_600_000 + 60_000).toISOString(),
    failure: { code: "out_of_credits", provider: "anthropic" },
  }));
  const w = await worker({ runs: walls, chats: { "routine-r1": earlier } });

  const json = await w.reconcile(abandonedFire());

  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(json.events).toEqual(["RoutinesChanged"]);
  const [saved] = JSON.parse(
    w.pool.read(`${AGENT}/.houston/routines/routines.json`),
  ) as Routine[];
  expect(saved?.enabled).toBe(false);
  expect(w.runs()).toEqual(walls);
});

test("a surfaced run whose card never landed gets it back on the retry", async () => {
  const surfaced: RoutineRun = {
    id: "t1",
    routine_id: "r1",
    status: "surfaced",
    session_key: "routine-r1",
    started_at: new Date(STARTED).toISOString(),
    completed_at: new Date(STARTED + 60_000).toISOString(),
    summary: "Two new invoices.",
    activity_id: "card-1",
  };
  const w = await worker({
    runs: [surfaced],
    chats: { "routine-r1": earlier },
  });

  const json = await w.reconcile({ conversationId: "routine-r1" });

  expect(json.events, JSON.stringify(json)).toEqual(["ActivityChanged"]);
  const board = JSON.parse(
    w.pool.read(`${AGENT}/.houston/activity/activity.json`),
  ) as { id: string; session_key: string }[];
  expect(board).toEqual([
    expect.objectContaining({ id: "card-1", session_key: "routine-r1" }),
  ]);
});

test("a shared chat's lost card comes back carrying its newest run", async () => {
  const surfaced = (id: string, hoursAgo: number): RoutineRun => ({
    id,
    routine_id: "r1",
    status: "surfaced",
    session_key: "routine-r1",
    started_at: new Date(STARTED - hoursAgo * 3_600_000).toISOString(),
    completed_at: new Date(
      STARTED - hoursAgo * 3_600_000 + 60_000,
    ).toISOString(),
    summary: `run ${id}`,
    activity_id: "card-1",
  });
  const w = await worker({
    runs: [surfaced("t2", 0), surfaced("t1", 2)],
    chats: { "routine-r1": earlier },
  });

  await w.reconcile({ conversationId: "routine-r1" });

  const board = JSON.parse(
    w.pool.read(`${AGENT}/.houston/activity/activity.json`),
  ) as { id: string; routine_run_id?: string }[];
  expect(board).toHaveLength(1);
  expect(board[0]?.routine_run_id).toBe("t2");
});

test("a dead turn of a since-deleted routine settles its running row as cancelled", async () => {
  const orphan: RoutineRun = {
    id: "t1",
    routine_id: "gone",
    status: "running",
    session_key: "routine-gone",
    started_at: new Date(STARTED).toISOString(),
  };
  const w = await worker({
    runs: [orphan, finishedRun],
    chats: { "routine-gone": [userOf("t1", STARTED)] },
  });

  const json = await w.reconcile({
    conversationId: "routine-gone",
    abandoned: {
      turnId: "t1",
      startedAt: orphan.started_at,
      routine: true,
    },
  });

  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(w.runs().find((r) => r.id === "t1")).toMatchObject({
    status: "cancelled",
    summary: "This run's routine was deleted.",
  });
  expect(w.runs().find((r) => r.id === "p0")).toEqual(finishedRun);
});
