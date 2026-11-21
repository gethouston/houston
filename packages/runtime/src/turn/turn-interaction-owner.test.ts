import { createRoutine } from "@houston/domain";
import { afterEach, expect, test, vi } from "vitest";
import {
  AGENT,
  cardConversation,
  closeTurnServers,
  OTHER,
  OWNER,
  pooledTurn,
} from "./turn-interaction-owner.test-support";

afterEach(closeTurnServers);

test("another member's message is refused with a 403 before the stream opens", async () => {
  const out = await pooledTurn("c1", { actingAs: { userId: OTHER } });

  expect(out.res.status).toBe(403);
  expect(out.res.headers.get("content-type")).toMatch(/application\/json/);
  expect(JSON.parse(out.text)).toEqual({
    error: "not_interaction_owner",
    code: "not_interaction_owner",
  });
  expect(out.runTurn).not.toHaveBeenCalled();
  expect(out.turnlog).toEqual([]);
  expect(out.pool.transcripts).toEqual([]);
  expect(out.pool.writes).toEqual([]);
  expect(JSON.parse(out.pool.read(out.conversationKey))).toEqual(
    JSON.parse(cardConversation("c1")),
  );
});

test("the person the card is for runs the turn", async () => {
  const out = await pooledTurn("c1", { actingAs: { userId: OWNER } });

  expect(out.res.status).toBe(200);
  expect(out.res.headers.get("content-type")).toMatch(/text\/event-stream/);
  expect(out.runTurn).toHaveBeenCalledOnce();
});

test("a routine run is not refused by a card an earlier run left", async () => {
  const routine = createRoutine(
    { name: "Digest", prompt: "check", schedule: "0 9 * * *" },
    "r1",
    "2026-09-29T10:00:00.000Z",
  );
  const out = await pooledTurn(
    "routine-r1",
    { actingAs: { userId: OTHER }, routine: { id: "r1" }, text: "" },
    (put) =>
      put(
        `${AGENT}/.houston/routines/routines.json`,
        JSON.stringify([routine]),
      ),
  );

  expect(out.res.status).toBe(200);
  expect(out.text).not.toContain("not_interaction_owner");
});

const actingToken = (sub: string) =>
  `acting-v1.${Buffer.from(
    JSON.stringify({ sub, exp: 9_000_000_000, via: "assistant" }),
  ).toString("base64url")}.sig`;

test("the AI Manager acting for the person the card is for runs the turn", async () => {
  const out = await pooledTurn("c1", {
    actingAs: { userId: OWNER },
    actingToken: actingToken(OWNER),
  });

  expect(out.res.status).toBe(200);
  expect(out.runTurn).toHaveBeenCalledOnce();
});

test("the AI Manager acting for another member is refused", async () => {
  const out = await pooledTurn("c1", {
    actingAs: { userId: OTHER },
    actingToken: actingToken(OTHER),
  });

  expect(out.res.status).toBe(403);
  expect(out.runTurn).not.toHaveBeenCalled();
  expect(out.turnlog).toEqual([]);
});

test("a turn with no acting identity is never refused", async () => {
  const out = await pooledTurn("c1", {});

  expect(out.res.status).toBe(200);
  expect(out.runTurn).toHaveBeenCalledOnce();
});

test("the card is read under the claim, not from bytes prefetched before it", async () => {
  const out = await pooledTurn(
    "c1",
    { actingAs: { userId: OTHER } },
    undefined,
    { stalePrefetch: true, storeGeneration: "2" },
  );

  expect(out.res.status).toBe(403);
  expect(out.reads.full).toBe(1);
  expect(out.runTurn).not.toHaveBeenCalled();
  expect(out.turnlog).toEqual([]);
});

test("a prefetched turn from the card's own person runs", async () => {
  const out = await pooledTurn(
    "c1",
    { actingAs: { userId: OWNER } },
    undefined,
    { stalePrefetch: true, storeGeneration: "2" },
  );

  expect(out.res.status).toBe(200);
  expect(out.runTurn).toHaveBeenCalledOnce();
});

test("an unchanged generation is not read again: the prefetched bytes decide", async () => {
  const out = await pooledTurn(
    "c1",
    { actingAs: { userId: OTHER } },
    undefined,
    { stalePrefetch: true, storeGeneration: "1" },
  );

  expect(out.reads).toEqual({ full: 0, notModified: 1 });
  expect(out.res.status).toBe(200);
  expect(out.runTurn).toHaveBeenCalledOnce();
});

test("a store failure on the fresh read is answered like one during hydration", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const fresh = await pooledTurn(
      "c1",
      { actingAs: { userId: OTHER } },
      undefined,
      { stalePrefetch: true, storeGeneration: "2", failRead: 403 },
    );
    const hydrating = await pooledTurn(
      "c2",
      { actingAs: { userId: OTHER } },
      undefined,
      { failHydration: 403 },
    );

    for (const out of [fresh, hydrating]) {
      expect(out.res.status).toBe(500);
      expect(JSON.parse(out.text)).toMatchObject({
        error: expect.stringContaining("failed (403)"),
      });
      expect(out.runTurn).not.toHaveBeenCalled();
      expect(out.turnlog).toEqual([]);
    }
  } finally {
    errorLog.mockRestore();
  }
});
