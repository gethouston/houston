import { expect, test } from "vitest";
import {
  conversation,
  opWorker,
  RUNTIME,
} from "./server-op-conversation.test-support";

const OWNER = "member-owner";
const OTHER = "member-other";

const withCard = {
  ...conversation,
  messages: [
    ...conversation.messages.slice(0, 2),
    {
      role: "user" as const,
      content: "send it",
      ts: 3,
      turnId: "t2",
      author: { userId: OWNER },
    },
    {
      role: "assistant" as const,
      content: "",
      ts: 4,
      turnId: "t2",
      pendingInteraction: {
        steps: [{ kind: "question", id: "q1", question: "Send it?" }],
      },
    },
  ],
};

const dismiss = (extra: Record<string, unknown> = {}) => ({
  kind: "conversation",
  action: "dismiss-interaction",
  conversationId: "c1",
  ...extra,
});

const FILE = `${RUNTIME}/conversations/c1.json`;

test("another member's dismissal is refused and writes nothing", async () => {
  const { pool, post } = await opWorker();
  pool.put(FILE, JSON.stringify(withCard));

  const out = await post(dismiss(), { actingAs: { userId: OTHER } });

  expect(out.status).toBe(403);
  expect(JSON.parse(out.body ?? "null")).toEqual({
    error: "not_interaction_owner",
    code: "not_interaction_owner",
  });
  expect(JSON.parse(pool.read(FILE))).toEqual(withCard);
  expect(pool.writes).toEqual([]);
  expect(pool.transcripts).toEqual([]);
});

test("the database rows decide whose card it is", async () => {
  const { pool, post } = await opWorker();
  pool.put(FILE, JSON.stringify(conversation));

  const out = await post(dismiss({ transcript: withCard }), {
    actingAs: { userId: OTHER },
  });

  expect(out.status).toBe(403);
  expect(JSON.parse(pool.read(FILE))).toEqual(conversation);
  expect(pool.writes).toEqual([]);
});

test("the person the card is for dismisses it", async () => {
  const { pool, post } = await opWorker();
  pool.put(FILE, JSON.stringify(withCard));

  const out = await post(dismiss(), { actingAs: { userId: OWNER } });

  expect(out.status).toBe(200);
  expect(JSON.parse(out.body ?? "null")).toEqual({ ok: true });
  expect(JSON.parse(pool.read(FILE)).messages.at(-1)).toMatchObject({
    role: "assistant",
    stopped: true,
  });
});

test("the AI Manager acting for the owner dismisses it", async () => {
  const { pool, post } = await opWorker();
  pool.put(FILE, JSON.stringify(withCard));

  const out = await post(dismiss(), {
    actingAs: { userId: OWNER, via: "assistant" },
  });

  expect(out.status).toBe(200);
  expect(JSON.parse(pool.read(FILE)).messages.at(-1)?.stopped).toBe(true);
});

test("the AI Manager acting for another member is refused", async () => {
  const { pool, post } = await opWorker();
  pool.put(FILE, JSON.stringify(withCard));

  const out = await post(dismiss(), {
    actingAs: { userId: OTHER, via: "assistant" },
  });

  expect(out.status).toBe(403);
  expect(JSON.parse(pool.read(FILE))).toEqual(withCard);
});

const imported = {
  importId: "onboarding",
  at: "end",
  messages: [{ role: "assistant", content: "welcome" }],
};

for (const [action, body] of [
  ["import", imported],
  ["truncate", { turnId: "t2" }],
] as const) {
  test(`another member's ${action} is refused and writes nothing`, async () => {
    const { pool, post } = await opWorker();
    pool.put(FILE, JSON.stringify(withCard));

    const out = await post(
      { ...dismiss(), action, body: JSON.stringify(body) },
      { actingAs: { userId: OTHER } },
    );

    expect(out.status).toBe(403);
    expect(JSON.parse(out.body ?? "null")).toEqual({
      error: "not_interaction_owner",
      code: "not_interaction_owner",
    });
    expect(JSON.parse(pool.read(FILE))).toEqual(withCard);
    expect(pool.writes).toEqual([]);
  });

  test(`the person the card is for may ${action}`, async () => {
    const { pool, post } = await opWorker();
    pool.put(FILE, JSON.stringify(withCard));

    const out = await post(
      { ...dismiss(), action, body: JSON.stringify(body) },
      { actingAs: { userId: OWNER } },
    );

    expect(out.status).toBe(200);
    expect(JSON.parse(pool.read(FILE))).not.toEqual(withCard);
  });
}
