import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { beforeEach, expect, test, vi } from "vitest";
import { reportRevokedServedToken } from "../../auth/report-revoked";
import { runWithActingContext } from "../../session/acting-context";
import { assertAnthropicScopeCredential } from "./scope-guard";
import { type ClaudeQuery, ClaudeSession } from "./session";
import type { SessionsStore } from "./sessions-store";

vi.mock("../../auth/report-revoked", () => ({
  reportRevokedServedToken: vi.fn(),
}));

/**
 * A refused resume reruns the turn fresh on its OWN credential read. Whatever
 * way that rerun fails, the revoked-token report must name the token the rerun
 * ran on (`d-2`), never the refused attempt's (`d-1`).
 */

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(reportRevokedServedToken).mockClear();
});

const REVOKED = "401 OAuth access token has been revoked";

const store: SessionsStore = {
  getSessionId: () => undefined,
  setSessionId: () => {},
  remove: () => {},
  purge: () => {},
  resolveResume: () => "sess-gone",
};

function scripted(msgs: SDKMessage[]): AsyncIterable<SDKMessage> {
  return (async function* () {
    for (const m of msgs) {
      await Promise.resolve();
      yield m;
    }
  })();
}

function rejecting(err: Error): AsyncIterable<SDKMessage> {
  return {
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        throw err;
      },
    }),
  };
}

const refused = () =>
  rejecting(new Error("No conversation found with session ID: sess-gone"));

/** Attempt 1 is refused as a dangling resume; attempt 2 runs `second`. */
function retryingQuery(
  second: () => AsyncIterable<SDKMessage>,
): ClaudeQuery & { optionsSeen: Options[] } {
  const optionsSeen: Options[] = [];
  const query = (params: { options: Options }) => {
    optionsSeen.push(params.options);
    return optionsSeen.length === 1 ? refused() : second();
  };
  return Object.assign(query as ClaudeQuery, { optionsSeen });
}

function make(
  query: ClaudeQuery,
  refreshAuth?: () => { env: Record<string, string>; accessDigest?: string },
): ClaudeSession {
  let reads = 0;
  return new ClaudeSession({
    query,
    conversationId: "c1",
    baseOptions: {} as Options,
    sessionsStore: store,
    model: "claude-sonnet-4-6",
    refreshAuth:
      refreshAuth ??
      (() => {
        reads++;
        return {
          env: { CLAUDE_CODE_OAUTH_TOKEN: `tok-${reads}` },
          accessDigest: `d-${reads}`,
        };
      }),
  });
}

function reportedDigests(): unknown[] {
  return vi.mocked(reportRevokedServedToken).mock.calls.map((c) => c[1]);
}

test("a rerun failing with an error result reports the rerun's digest", async () => {
  const query = retryingQuery(() =>
    scripted([
      {
        type: "result",
        subtype: "error_during_execution",
        errors: [REVOKED],
        api_error_status: 401,
        usage: { input_tokens: 1, output_tokens: 0 },
        session_id: "s",
      } as unknown as SDKMessage,
    ]),
  );
  await make(query).prompt("go");
  expect(query.optionsSeen.map((o) => o.env?.CLAUDE_CODE_OAUTH_TOKEN)).toEqual([
    "tok-1",
    "tok-2",
  ]);
  expect(reportedDigests()).toEqual(["d-2"]);
});

test("a rerun failing with an assistant message error reports the rerun's digest", async () => {
  const query = retryingQuery(() =>
    scripted([
      {
        type: "assistant",
        error: "authentication_failed",
        message: { role: "assistant", model: "m", content: [] },
        parent_tool_use_id: null,
        session_id: "s",
      } as unknown as SDKMessage,
    ]),
  );
  await make(query).prompt("go");
  expect(query.optionsSeen).toHaveLength(2);
  expect(reportedDigests()).toEqual(["d-2"]);
});

test("a rerun throwing before its first SDK message reports the rerun's digest", async () => {
  const query = retryingQuery(() => rejecting(new Error(REVOKED)));
  await make(query).prompt("go");
  expect(query.optionsSeen).toHaveLength(2);
  expect(reportedDigests()).toEqual(["d-2"]);
});

test("a rerun whose credential read refuses the personal scope throws that refusal and starts no second query", async () => {
  const query = retryingQuery(() => scripted([]));
  let reads = 0;
  const session = make(query, () => {
    reads++;
    if (reads === 2) assertAnthropicScopeCredential(undefined);
    return { env: { CLAUDE_CODE_OAUTH_TOKEN: "tok-1" }, accessDigest: "d-1" };
  });
  const payload = Buffer.from(
    JSON.stringify({ sub: "sub-member", agent: "a", exp: 9_000_000_000 }),
  ).toString("base64url");
  await expect(
    runWithActingContext({ actingAs: `acting-v1.${payload}.sig` }, () =>
      session.prompt("go"),
    ),
  ).rejects.toThrow(/^No provider connected\./);
  expect(reads).toBe(2);
  expect(query.optionsSeen).toHaveLength(1);
});

test("a dispose landing during the refused attempt starts no rerun", async () => {
  let session: ClaudeSession | undefined;
  const optionsSeen: Options[] = [];
  const query: ClaudeQuery = (params) => {
    optionsSeen.push(params.options);
    if (optionsSeen.length > 1) return scripted([]);
    session?.dispose();
    return refused();
  };
  session = make(query);
  await session.prompt("go");
  expect(optionsSeen).toHaveLength(1);
});
