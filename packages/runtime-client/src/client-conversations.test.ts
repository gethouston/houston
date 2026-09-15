import { describe, expect, it, vi } from "vitest";
import { HoustonEngineClient } from "./client";

/**
 * The conversation-record routes {@link EngineConversationsClient} contributes
 * to {@link HoustonEngineClient}. Asserted THROUGH the concrete client, because
 * that is the only way anything calls them: the split is a file boundary, never
 * a surface a caller reaches on its own.
 *
 * Most of this family keys one conversation by id, and several routes differ
 * only by their last segment (`/cancel` vs `/truncate` vs `/mode`) or by method
 * alone (`PATCH` renames, `DELETE` destroys the SAME url) — so each case pins
 * the exact outgoing {method, url, body}. A swapped literal here deletes a chat
 * the user asked to rename.
 */

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  url: string;
  body?: unknown;
}

function makeClient(payload: unknown = { ok: true }) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(input),
        body:
          init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  );
  const client = new HoustonEngineClient({
    baseUrl: BASE,
    fetch: fetchImpl as unknown as typeof fetch,
  });
  return { client, calls };
}

// The id carries a slash and a space: every route below must ESCAPE it, or the
// segment splices the path and the call lands on a different route.
const ID = "chat 1/x";
const ENC = `${BASE}/conversations/chat%201%2Fx`;

describe("the engine client's conversation-record routes", () => {
  it("lists the runtime's conversations", async () => {
    const { client, calls } = makeClient([]);
    await expect(client.listConversations()).resolves.toEqual([]);
    expect(calls).toEqual([{ method: "GET", url: `${BASE}/conversations` }]);
  });

  it("reads the whole transcript when no window is asked for", async () => {
    const { client, calls } = makeClient({ messages: [] });
    await client.getHistory(ID);
    expect(calls[0]).toEqual({ method: "GET", url: `${ENC}/messages` });
  });

  it("asks for a transcript window by limit and by absolute index", async () => {
    const { client, calls } = makeClient({ messages: [] });
    await client.getHistory(ID, { limit: 50 });
    await client.getHistory(ID, { before: 120, limit: 50 });
    expect(calls.map((c) => c.url)).toEqual([
      `${ENC}/messages?limit=50`,
      `${ENC}/messages?limit=50&before=120`,
    ]);
  });

  it("keeps a zero window instead of dropping it as falsy", async () => {
    // `before: 0` is the first page, not "no page": a truthiness check here
    // would silently load the newest window instead of the oldest.
    const { client, calls } = makeClient({ messages: [] });
    await client.getHistory(ID, { before: 0 });
    expect(calls[0].url).toBe(`${ENC}/messages?before=0`);
  });

  it("cancels the in-flight turn and reports whether one was stopped", async () => {
    const { client, calls } = makeClient({ ok: true, cancelled: false });
    await expect(client.cancel(ID)).resolves.toEqual({
      ok: true,
      cancelled: false,
    });
    expect(calls[0]).toEqual({ method: "POST", url: `${ENC}/cancel` });
  });

  it("applies a mode switch to the executing turn", async () => {
    const { client, calls } = makeClient({ ok: true, applied: true });
    await client.setMode(ID, "plan");
    expect(calls[0]).toEqual({
      method: "POST",
      url: `${ENC}/mode`,
      body: { mode: "plan" },
    });
  });

  it("retires a pending interaction with the durable stop marker", async () => {
    const { client, calls } = makeClient();
    await client.dismissInteraction(ID);
    expect(calls[0]).toEqual({
      method: "POST",
      url: `${ENC}/dismiss-interaction`,
    });
  });

  it("truncates the transcript tail from a named turn", async () => {
    const { client, calls } = makeClient({ ok: true, removed: 3 });
    await expect(client.truncateConversation(ID, "t7")).resolves.toEqual({
      ok: true,
      removed: 3,
    });
    expect(calls[0]).toEqual({
      method: "POST",
      url: `${ENC}/truncate`,
      body: { turnId: "t7" },
    });
  });

  it("renames and deletes the SAME url, told apart only by method", async () => {
    const { client, calls } = makeClient();
    await client.renameConversation(ID, "New title");
    await client.deleteConversation(ID);
    expect(calls).toEqual([
      { method: "PATCH", url: ENC, body: { title: "New title" } },
      { method: "DELETE", url: ENC, body: undefined },
    ]);
  });

  it("titles a stored conversation on its own route", async () => {
    const { client, calls } = makeClient({ title: "Trip plan" });
    await expect(client.summarizeTitle(ID)).resolves.toEqual({
      title: "Trip plan",
    });
    expect(calls[0]).toEqual({ method: "POST", url: `${ENC}/title` });
  });

  it("titles a loose excerpt with no conversation to key on", async () => {
    const { client, calls } = makeClient({ title: "" });
    await client.summarizeText("hello there");
    expect(calls[0]).toEqual({
      method: "POST",
      url: `${BASE}/title`,
      body: { text: "hello there" },
    });
  });
});
