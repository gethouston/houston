import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { ROUTINE_FIRE_HEADER, type WireFrame } from "@houston/protocol";
import { afterAll, beforeEach, expect, test, vi } from "vitest";

const exec = vi.hoisted(() => ({
  recorded: [] as string[],
  executed: [] as string[],
  first: null as Promise<void> | null,
  onFirst: () => {},
}));
vi.mock("../session/exec-turn", async (original) => ({
  ...(await original<typeof import("../session/exec-turn")>()),
  recordUserTurn: (
    _conv: unknown,
    _id: string,
    _turnId: string,
    text: string,
  ) => {
    exec.recorded.push(text);
    return { author: undefined, priorAuthors: [] };
  },
  execTurn: async (
    _conv: unknown,
    _id: string,
    _turnId: string,
    text: string,
  ) => {
    exec.executed.push(text);
    if (exec.executed.length === 1 && exec.first) {
      await exec.first;
      exec.onFirst();
    }
    return null;
  },
}));
vi.mock("../session/conversation-cache", async (original) => {
  const real = await original<typeof import("../session/conversation-cache")>();
  const fake = new Map<string, { queue: Promise<unknown>; pending: number }>();
  return {
    ...real,
    getConversation: async (id: string) => {
      const conv = fake.get(id) ?? { queue: Promise.resolve(), pending: 0 };
      fake.set(id, conv);
      real.conversations.set(
        id,
        conv as unknown as Parameters<typeof real.conversations.set>[1],
      );
      return conv;
    },
  };
});
const serve = vi.hoisted(() => ({ pinUnavailable: false }));
vi.mock("../session/provider-gate", async (original) => ({
  ...(await original<typeof import("../session/provider-gate")>()),
  connectedProviderForTurn: async () => "openai",
  pinnedProviderUnavailable: async () => serve.pinUnavailable,
}));
vi.mock("../auth/serve", async (original) => ({
  ...(await original<typeof import("../auth/serve")>()),
  serveModeOn: () => serve.pinUnavailable,
  syncServedCredentialSafe: async () => {},
}));
const held = vi.hoisted(() => ({ turns: [] as Promise<void>[] }));
vi.mock("../session/conversation-command-gate", () => ({
  conversationCommandBusy: () => false,
  conversationCommandInFlight: () => false,
  holdConversationTurn: (_id: string, turn: Promise<void>) => {
    held.turns.push(turn);
  },
}));

const dataDir = mkdtempSync(join(tmpdir(), "queued-answer-"));
vi.stubEnv("HOUSTON_DATA_DIR", dataDir);
const { handleConversationRoute } = await import("./conversation-routes");
const { subscribe } = await import("../session/bus");
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(dataDir, { recursive: true, force: true });
});

const A = "member-a";
const B = "member-b";
const token = (sub: string) =>
  `acting-v1.${Buffer.from(JSON.stringify({ sub, exp: 9_000_000_000 })).toString("base64url")}.sig`;

const file = (id: string) => join(dataDir, "conversations", `${id}.json`);
function write(id: string, messages: unknown[]) {
  mkdirSync(join(dataDir, "conversations"), { recursive: true });
  writeFileSync(
    file(id),
    JSON.stringify({ id, title: "Chat", createdAt: 1, updatedAt: 2, messages }),
  );
}
const settled = [
  { role: "user", content: "hi", ts: 1, turnId: "t0", author: { userId: A } },
  { role: "assistant", content: "hello", ts: 2, turnId: "t0" },
];
const cardForA = [
  ...settled,
  {
    role: "user",
    content: "send it",
    ts: 3,
    turnId: "tA",
    author: { userId: A },
  },
  {
    role: "assistant",
    content: "",
    ts: 4,
    turnId: "tA",
    pendingInteraction: {
      steps: [{ kind: "question", id: "q1", question: "Send it?" }],
    },
  },
];

function send(
  id: string,
  sub: string,
  text: string,
  nonce: string,
  headers: Record<string, string> = {},
  extra: Record<string, unknown> = {},
) {
  const out: { status?: number; body?: { turnId?: string; code?: string } } =
    {};
  const req = Readable.from([
    Buffer.from(JSON.stringify({ text, nonce, ...extra })),
  ]) as IncomingMessage;
  req.headers = { "x-houston-acting-as": token(sub), ...headers };
  const res = {
    writeHead: (status: number) => {
      out.status = status;
    },
    end: (payload: Buffer) => {
      out.body = JSON.parse(payload.toString());
    },
  } as unknown as ServerResponse;
  const path = `/conversations/${id}/messages`;
  return handleConversationRoute({
    method: "POST",
    path,
    url: new URL(`http://runtime.test${path}`),
    req,
    res,
  }).then(() => out);
}

async function raceBehindCard(
  id: string,
  second: {
    sub: string;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
  },
) {
  write(id, settled);
  let release = () => {};
  exec.first = new Promise<void>((resolve) => {
    release = resolve;
  });
  exec.onFirst = () =>
    write(id, [
      ...JSON.parse(readFileSync(file(id), "utf8")).messages,
      ...cardForA.slice(settled.length),
    ]);
  const frames: WireFrame[] = [];
  const unsubscribe = subscribe(id, (frame) => frames.push(frame));
  expect((await send(id, A, "send it", `${id}-a`)).status).toBe(202);
  await vi.waitFor(() => expect(exec.executed).toEqual(["send it"]));
  const admitted = await send(
    id,
    second.sub,
    "yes",
    `${id}-2`,
    second.headers,
    second.body,
  );
  expect(admitted.status).toBe(202);
  release();
  await Promise.all(held.turns);
  unsubscribe();
  return { frames, turnId: admitted.body?.turnId };
}

beforeEach(() => {
  serve.pinUnavailable = false;
  exec.recorded = [];
  exec.executed = [];
  held.turns = [];
});

test("a send queued behind a turn that ends on someone else's card is refused when it starts", async () => {
  const { frames, turnId } = await raceBehindCard("q1", { sub: B });

  expect(exec.recorded).toEqual(["send it"]);
  expect(exec.executed).toEqual(["send it"]);
  expect(
    frames
      .filter((frame) => frame.turnId === turnId)
      .map(({ type, data }) => ({ type, data })),
  ).toEqual([
    {
      type: "error",
      data: {
        message: "not_interaction_owner",
        code: "not_interaction_owner",
      },
    },
  ]);
  expect(JSON.parse(readFileSync(file("q1"), "utf8")).messages).toEqual(
    cardForA,
  );
  expect(await send("q1", B, "yes", "q1-2")).toMatchObject({
    status: 403,
    body: { code: "not_interaction_owner" },
  });
});

test("the card's own person, queued behind the turn that raised it, answers it", async () => {
  await raceBehindCard("q2", { sub: A });

  expect(exec.recorded).toEqual(["send it", "yes"]);
  expect(exec.executed).toEqual(["send it", "yes"]);
});

test("a routine fire queued behind the card still runs", async () => {
  await raceBehindCard("q3", {
    sub: B,
    headers: { [ROUTINE_FIRE_HEADER]: "1" },
  });

  expect(exec.executed).toEqual(["send it", "yes"]);
});

test("a send that fails before it runs records nothing over someone else's card", async () => {
  serve.pinUnavailable = true;
  const { frames, turnId } = await raceBehindCard("q4", {
    sub: B,
    body: { provider: "anthropic" },
  });

  expect(exec.recorded).toEqual(["send it"]);
  expect(JSON.parse(readFileSync(file("q4"), "utf8")).messages).toEqual(
    cardForA,
  );
  expect(
    frames
      .filter((frame) => frame.turnId === turnId)
      .map(({ type, data }) => ({ type, data })),
  ).toEqual([
    {
      type: "error",
      data: {
        message: "not_interaction_owner",
        code: "not_interaction_owner",
      },
    },
  ]);
});

test("a failing send with no card in the way still records its failure", async () => {
  serve.pinUnavailable = true;
  write("q5", settled);
  expect(
    (await send("q5", B, "yes", "q5-b", {}, { provider: "anthropic" })).status,
  ).toBe(202);
  await Promise.all(held.turns);

  const messages = JSON.parse(readFileSync(file("q5"), "utf8")).messages;
  expect(messages).toHaveLength(4);
  expect(messages.at(-1)).toMatchObject({
    role: "assistant",
    providerError: { kind: "unauthenticated" },
  });
});
