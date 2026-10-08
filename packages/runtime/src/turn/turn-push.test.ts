import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import type { TurnServerDeps } from "./server-types";
import { reportPooledSettle, stampPooledTurn } from "./turn-push";
import {
  agentStore,
  claimedTurn,
  PREFIX,
  podDocs,
  seed,
  WORKSPACE_REL,
} from "./turn-views.test-support";
import type { TurnRequest } from "./types";

test("pooled turns stamp contributors and mentions, then post through the turn gateway", async () => {
  const agent = await agentStore();
  const board = `${WORKSPACE_REL}/.houston/activity/activity.json`;
  await seed(
    agent.prefixRoot,
    board,
    JSON.stringify([
      {
        id: "m",
        title: "Review",
        description: "",
        status: "running",
        session_key: "c1",
      },
    ]),
  );
  const { filesystem } = await claimedTurn(agent, podDocs());
  const posts: {
    url: string;
    headers: Headers;
    body: Record<string, unknown>;
  }[] = [];
  const deps = {
    turnLogUrl: "https://gateway.test",
    fetchImpl: async (url: RequestInfo | URL, init?: RequestInit) => {
      posts.push({
        url: String(url),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return new Response(null, { status: 202 });
    },
  } as TurnServerDeps;
  const turn = {
    claim: { token: "claim", bootId: "boot" },
    hostToken: "turn-bearer",
    actingToken: "acting-token",
    actingAs: { userId: "alice", name: "Alice" },
    mentions: [{ userId: "bob" }],
    gcsPrefix: PREFIX,
    conversationId: "c1",
  } as TurnRequest;
  const input = {
    deps,
    turn,
    turnId: "turn-1",
    filesystem,
    resolved: { store: agent.store, prefix: PREFIX },
  };
  await stampPooledTurn(input);
  const stored = JSON.parse(
    await readFile(join(agent.prefixRoot, board), "utf8"),
  ) as {
    contributors?: { user_id: string }[];
    mentioned?: { user_id: string }[];
  }[];
  expect(stored[0]?.contributors?.[0]?.user_id).toBe("alice");
  expect(stored[0]?.mentioned?.[0]?.user_id).toBe("bob");
  await reportPooledSettle(input, {
    outcome: {},
    poolWritesOutOfScope: 0,
    changed: [],
  });
  expect(posts.map((post) => post.body.kind)).toEqual([
    "mentioned",
    "turn_settled",
  ]);
  expect(posts[0]?.headers.get("x-houston-acting-as")).toBe("acting-token");
  expect(posts[1]?.body).toMatchObject({
    turn_id: "turn-1",
    reason: "finished",
    audience: { user_ids: ["alice", "bob"] },
  });
  expect(posts[1]?.url).toBe("https://gateway.test/v1/pod/push/w1/agent-1");
  await reportPooledSettle(input, {
    outcome: { error: "claim_fenced" },
    poolWritesOutOfScope: 0,
    changed: [],
  });
  expect(posts).toHaveLength(2);
});

test("exhausted push retries reach runtime error reporting without failing the turn", async () => {
  const agent = await agentStore();
  await seed(
    agent.prefixRoot,
    `${WORKSPACE_REL}/.houston/activity/activity.json`,
    JSON.stringify([
      {
        id: "m",
        title: "Review",
        description: "",
        status: "running",
        session_key: "c1",
      },
    ]),
  );
  const { filesystem } = await claimedTurn(agent, podDocs());
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const input = {
    deps: {
      turnLogUrl: "https://gateway.test",
      fetchImpl: async () => new Response(null, { status: 500 }),
    } as unknown as TurnServerDeps,
    turn: {
      claim: { token: "claim", bootId: "boot" },
      hostToken: "turn-bearer",
      gcsPrefix: PREFIX,
      conversationId: "c1",
    } as TurnRequest,
    turnId: "turn-1",
    filesystem,
    resolved: { store: agent.store, prefix: PREFIX },
  };
  try {
    await reportPooledSettle(input, {
      outcome: {},
      poolWritesOutOfScope: 0,
      changed: [],
    });
    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining("[push]"),
      expect.anything(),
    );
  } finally {
    errors.mockRestore();
  }
});
