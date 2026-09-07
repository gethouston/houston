import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import type { HarnessSession } from "../backends/types";

/**
 * Compact-time extraction, end to end through the seam: the assistant's
 * compaction asks for facts and saves them through the SAME merge-safe host
 * route the `save_learning` tool uses; every other conversation compacts with no
 * instructions and saves nothing; and no failure of any of it reaches the turn.
 */

const WORKSPACE = mkdtempSync(join(tmpdir(), "houston-facts-ws-"));
process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-facts-data-"),
);
process.env.HOUSTON_WORKSPACE_DIR = WORKSPACE;
// The pair that gives this runtime a host to write through (config.ts) — without
// it the harvest has nowhere to save and silently does nothing.
process.env.HOUSTON_CONTROL_PLANE_URL = "https://host.test";
process.env.HOUSTON_SANDBOX_TOKEN = "sb-tok";

const { compactWithFactHarvest } = await import("./durable-facts-harvest");
const { DURABLE_FACTS_FENCE } = await import("./durable-facts");
const { CONVERSATION_ID_HEADER } = await import("./tools/save-learning");
const { ASSISTANT_CONVERSATION_ID } = await import(
  "@houston/host/src/routes/assistant"
);

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  writeLearnings([]);
});

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: { text?: string } | undefined;
}

function mockFetch(reply: () => Response | Promise<Response>): Captured[] {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: String(input),
      headers,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return reply();
  }) as typeof fetch;
  return calls;
}

const created = () =>
  new Response(JSON.stringify({ id: "l1" }), { status: 201 });

/** Seed (or clear) the agent's saved memories, as the host would have left them. */
function writeLearnings(texts: string[]): void {
  const dir = join(WORKSPACE, ".houston", "learnings");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "learnings.json"),
    JSON.stringify(
      texts.map((text, i) => ({ id: `seed-${i}`, text, created_at: "" })),
      null,
      2,
    ),
  );
}

/** A session whose compaction records its instructions and returns `summary`. */
function fakeSession(summary?: string): {
  session: HarnessSession;
  instructions: () => string | undefined;
} {
  let seen: string | undefined;
  const session = {
    subscribe: () => () => {},
    prompt: async () => {},
    abort: async () => {},
    dispose: () => {},
    setModel: async () => {},
    async compact(customInstructions?: string) {
      seen = customInstructions;
      return summary === undefined ? undefined : { summary };
    },
    setThinkingLevel: () => {},
    getContextUsage: () => ({ tokens: 0 }),
  } satisfies HarnessSession;
  return { session, instructions: () => seen };
}

const summaryWith = (...facts: string[]) =>
  `The chat so far.\n\n\`\`\`${DURABLE_FACTS_FENCE}\n${facts.join("\n")}\n\`\`\``;

test("the assistant's compaction asks for facts and saves each one", async () => {
  const calls = mockFetch(created);
  const { session, instructions } = fakeSession(
    summaryWith("Runs a bakery in Porto.", "Closes on Mondays."),
  );

  await compactWithFactHarvest(session, ASSISTANT_CONVERSATION_ID);

  expect(instructions()).toContain(DURABLE_FACTS_FENCE);
  expect(calls.map((c) => c.url)).toEqual([
    "https://host.test/sandbox/learnings/save",
    "https://host.test/sandbox/learnings/save",
  ]);
  expect(calls.map((c) => c.body?.text)).toEqual([
    "Runs a bakery in Porto.",
    "Closes on Mondays.",
  ]);
  // Provenance the host derives: the sandbox token authenticates, the
  // conversation id names the mission. No acting-as — compaction runs outside
  // the turn's acting scope.
  expect(calls[0]?.headers.authorization).toBe("Bearer sb-tok");
  expect(calls[0]?.headers[CONVERSATION_ID_HEADER]).toBe(
    ASSISTANT_CONVERSATION_ID,
  );
  expect(calls[0]?.headers["x-houston-acting-as"]).toBeUndefined();
});

test("any other conversation compacts with no instructions and saves nothing", async () => {
  const calls = mockFetch(created);
  const { session, instructions } = fakeSession(
    summaryWith("Runs a bakery in Porto."),
  );

  await compactWithFactHarvest(session, "activity-42");

  expect(instructions()).toBeUndefined();
  expect(calls).toEqual([]);
});

test("a summary with no usable block saves nothing", async () => {
  const calls = mockFetch(created);
  const { session } = fakeSession("Plain summary, no block at all.");
  await compactWithFactHarvest(session, ASSISTANT_CONVERSATION_ID);
  expect(calls).toEqual([]);
});

test("a backend that returns no summary saves nothing", async () => {
  // The Claude backend compacts inside the SDK and surfaces no summary.
  const calls = mockFetch(created);
  const { session } = fakeSession(undefined);
  await compactWithFactHarvest(session, ASSISTANT_CONVERSATION_ID);
  expect(calls).toEqual([]);
});

test("a fact the agent already remembers is not saved again", async () => {
  writeLearnings(["Runs a bakery in Porto"]);
  const calls = mockFetch(created);
  const { session } = fakeSession(
    summaryWith("runs a bakery in Porto.", "Closes on Mondays."),
  );

  await compactWithFactHarvest(session, ASSISTANT_CONVERSATION_ID);

  expect(calls.map((c) => c.body?.text)).toEqual(["Closes on Mondays."]);
});

test("a host rejection never fails the compaction", async () => {
  mockFetch(
    () => new Response(JSON.stringify({ error: "full" }), { status: 400 }),
  );
  const { session } = fakeSession(summaryWith("Runs a bakery in Porto."));
  await expect(
    compactWithFactHarvest(session, ASSISTANT_CONVERSATION_ID),
  ).resolves.toBeUndefined();
});

test("an unreachable host never fails the compaction", async () => {
  mockFetch(() => Promise.reject(new Error("ECONNREFUSED")));
  const { session } = fakeSession(summaryWith("Runs a bakery in Porto."));
  await expect(
    compactWithFactHarvest(session, ASSISTANT_CONVERSATION_ID),
  ).resolves.toBeUndefined();
});
