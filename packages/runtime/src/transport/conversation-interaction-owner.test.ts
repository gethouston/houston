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
import { ROUTINE_FIRE_HEADER } from "@houston/protocol";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

const chat = vi.hoisted(() => ({
  runTurn: vi.fn(async () => {}),
  ensureProviderForTurn: vi.fn(async () => "openai" as string | null),
}));
vi.mock("../session/chat", () => ({
  cancelTurn: vi.fn(),
  disposeConversation: vi.fn(),
  ensureProviderForTurn: chat.ensureProviderForTurn,
  runTurn: chat.runTurn,
  setLiveTurnMode: vi.fn(),
}));

const commands = vi.hoisted(() => ({
  runConversationCommand: vi.fn(async () => {}),
}));
vi.mock("../session/conversation-command-run", () => ({
  runConversationCommand: commands.runConversationCommand,
}));

const dataDir = mkdtempSync(join(tmpdir(), "interaction-owner-route-"));
vi.stubEnv("HOUSTON_DATA_DIR", dataDir);
const { handleConversationRoute } = await import("./conversation-routes");
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(dataDir, { recursive: true, force: true });
});

const OWNER = "member-owner";
const OTHER = "member-other";

function actingToken(sub: string, via?: "assistant"): string {
  const payload = Buffer.from(
    JSON.stringify({ sub, agent: "acme", exp: 9_000_000_000, via }),
  ).toString("base64url");
  return `acting-v1.${payload}.sig`;
}

let seq = 0;
function seedCard(prefix = "c"): string {
  const id = `${prefix}${++seq}`;
  const dir = join(dataDir, "conversations");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${encodeURIComponent(id)}.json`),
    JSON.stringify({
      id,
      title: "Chat",
      createdAt: 1,
      updatedAt: 2,
      messages: [
        {
          role: "user",
          content: "hi",
          ts: 1,
          turnId: "t0",
          author: { userId: OTHER },
        },
        { role: "assistant", content: "hello", ts: 2, turnId: "t0" },
        {
          role: "user",
          content: "send it",
          ts: 3,
          turnId: "t1",
          author: { userId: OWNER },
        },
        {
          role: "assistant",
          content: "",
          ts: 4,
          turnId: "t1",
          pendingInteraction: {
            steps: [{ kind: "question", id: "q1", question: "Send it?" }],
          },
        },
      ],
    }),
  );
  return id;
}

function messagesOf(id: string): { stopped?: boolean }[] {
  return JSON.parse(
    readFileSync(
      join(dataDir, "conversations", `${encodeURIComponent(id)}.json`),
      "utf8",
    ),
  ).messages;
}

function post(
  path: string,
  body: unknown,
  token?: string,
  extraHeaders: Record<string, string> = {},
) {
  const out: { status?: number; body?: unknown } = {};
  const req = Readable.from([
    Buffer.from(JSON.stringify(body)),
  ]) as IncomingMessage;
  req.headers = {
    ...(token ? { "x-houston-acting-as": token } : {}),
    ...extraHeaders,
  };
  const res = {
    writeHead: (status: number) => {
      out.status = status;
    },
    end: (payload: Buffer) => {
      out.body = JSON.parse(payload.toString());
    },
  } as unknown as ServerResponse;
  return handleConversationRoute({
    method: "POST",
    path,
    url: new URL(`http://runtime.test${path}`),
    req,
    res,
  }).then(() => out);
}

const refusal = {
  status: 403,
  body: { error: "not_interaction_owner", code: "not_interaction_owner" },
};

beforeEach(() => {
  chat.runTurn.mockClear();
  commands.runConversationCommand.mockClear();
});

describe("answering a card (send)", () => {
  const send = (
    id: string,
    token?: string,
    text = "yes",
    headers: Record<string, string> = {},
  ) =>
    post(
      `/conversations/${id}/messages`,
      { text, nonce: `n-${id}` },
      token,
      headers,
    );

  test("the person the card is for answers it", async () => {
    const out = await send(seedCard(), actingToken(OWNER));
    expect(out.status).toBe(202);
    expect(chat.runTurn).toHaveBeenCalledOnce();
  });

  test("another member is refused and no turn starts", async () => {
    const id = seedCard();
    expect(await send(id, actingToken(OTHER))).toEqual(refusal);
    expect(chat.runTurn).not.toHaveBeenCalled();
    expect((await send(id, actingToken(OWNER))).status).toBe(202);
  });

  test("another member cannot clear the card away with a command", async () => {
    expect(await send(seedCard(), actingToken(OTHER), "/clear")).toEqual(
      refusal,
    );
    expect(commands.runConversationCommand).not.toHaveBeenCalled();
  });

  test("the AI Manager acting for the owner answers it", async () => {
    const out = await send(seedCard(), actingToken(OWNER, "assistant"));
    expect(out.status).toBe(202);
    expect(chat.runTurn).toHaveBeenCalledOnce();
  });

  test("the AI Manager acting for another member is refused", async () => {
    expect(await send(seedCard(), actingToken(OTHER, "assistant"))).toEqual(
      refusal,
    );
    expect(chat.runTurn).not.toHaveBeenCalled();
  });

  test("single-player (no acting identity) is never refused", async () => {
    expect((await send(seedCard())).status).toBe(202);
  });

  test("a routine fire is not refused by a card an earlier run left", async () => {
    const out = await send(seedCard("routine-r"), actingToken(OTHER), "run", {
      [ROUTINE_FIRE_HEADER]: "1",
    });
    expect(out.status).toBe(202);
    expect(chat.runTurn).toHaveBeenCalledOnce();
  });

  test("a person's message in a routine conversation is still the card's answer", async () => {
    expect(await send(seedCard("routine-r"), actingToken(OTHER))).toEqual(
      refusal,
    );
    expect(chat.runTurn).not.toHaveBeenCalled();
  });
});

describe("dismissing a card", () => {
  const dismiss = (id: string, token?: string) =>
    post(`/conversations/${id}/dismiss-interaction`, {}, token);

  test("the person the card is for dismisses it", async () => {
    const id = seedCard();
    expect(await dismiss(id, actingToken(OWNER))).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(messagesOf(id).at(-1)?.stopped).toBe(true);
  });

  test("another member is refused and no stop marker is written", async () => {
    const id = seedCard();
    expect(await dismiss(id, actingToken(OTHER))).toEqual(refusal);
    expect(messagesOf(id)).toHaveLength(4);
  });

  test("the AI Manager acting for the owner dismisses it", async () => {
    const id = seedCard();
    expect((await dismiss(id, actingToken(OWNER, "assistant"))).status).toBe(
      200,
    );
    expect(messagesOf(id).at(-1)?.stopped).toBe(true);
  });

  test("the AI Manager acting for another member is refused", async () => {
    const id = seedCard();
    expect(await dismiss(id, actingToken(OTHER, "assistant"))).toEqual(refusal);
    expect(messagesOf(id)).toHaveLength(4);
  });
});

describe("importing into or truncating a conversation with a live card", () => {
  const imported = {
    importId: "onboarding",
    at: "end",
    messages: [{ role: "assistant", content: "welcome" }],
  };
  const importInto = (id: string, token?: string) =>
    post(`/conversations/${id}/import`, imported, token);
  const truncate = (id: string, token?: string) =>
    post(`/conversations/${id}/truncate`, { turnId: "t1" }, token);

  test("another member's import is refused and appends nothing", async () => {
    const id = seedCard();
    expect(await importInto(id, actingToken(OTHER))).toEqual(refusal);
    expect(messagesOf(id)).toHaveLength(4);
  });

  test("the person the card is for imports", async () => {
    const id = seedCard();
    expect(await importInto(id, actingToken(OWNER))).toEqual({
      status: 200,
      body: { ok: true, imported: 1 },
    });
    expect(messagesOf(id)).toHaveLength(5);
  });

  test("another member's truncate is refused and cuts nothing", async () => {
    const id = seedCard();
    expect(await truncate(id, actingToken(OTHER))).toEqual(refusal);
    expect(messagesOf(id)).toHaveLength(4);
  });

  test("the person the card is for truncates", async () => {
    const id = seedCard();
    expect(await truncate(id, actingToken(OWNER))).toMatchObject({
      status: 200,
      body: { ok: true, removed: 2 },
    });
    expect(messagesOf(id)).toHaveLength(2);
  });
});
