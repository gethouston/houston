import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  announcesSelfAuthorship,
  isOwnMessage,
  isPeerRow,
  senderNameFor,
} from "../src/author-label.ts";
import type { ChatDisplayItem } from "../src/chat-process-groups.ts";
import {
  AGENT_RUN_KEY,
  senderRunKey,
  senderRunStarts,
} from "../src/chat-sender-runs.ts";
import {
  type ChatMessage,
  distinctAuthorCount,
} from "../src/feed-to-messages.ts";

/** A minimal user ChatMessage carrying an optional author. */
const userMsg = (author?: ChatMessage["author"], key = "u"): ChatMessage => ({
  key,
  from: "user",
  content: "hi",
  isStreaming: false,
  tools: [],
  fileChanges: [],
  author,
});

const agentMsg = (key = "a"): ChatMessage => ({
  key,
  from: "assistant",
  content: "reply",
  isStreaming: false,
  tools: [],
  fileChanges: [],
});

const systemMsg = (key = "s"): ChatMessage => ({
  key,
  from: "system",
  content: "context compacted",
  isStreaming: false,
  tools: [],
  fileChanges: [],
});

/** Wrap messages as the rendered display items `senderRunStarts` consumes. */
const rows = (...messages: ChatMessage[]): ChatDisplayItem[] =>
  messages.map((message, sourceIndex) => ({
    kind: "message",
    message,
    sourceIndex,
  }));

/** An agent's tool/reasoning block, which renders no sender line of its own. */
const processRow = (key: string, sourceIndex: number): ChatDisplayItem => ({
  kind: "process",
  key,
  segments: [],
  isActive: false,
  isTrailing: false,
  sourceIndex,
});

describe("distinctAuthorCount", () => {
  it("is 0 when no user message carries an author (single-player)", () => {
    assert.equal(distinctAuthorCount([userMsg(), userMsg()]), 0);
  });

  it("is 1 when every authored message is the same user", () => {
    const a = { userId: "user_a", name: "Ada" };
    assert.equal(distinctAuthorCount([userMsg(a), userMsg(a)]), 1);
  });

  it("counts distinct userIds, ignoring authorless messages", () => {
    const a = { userId: "user_a", name: "Ada" };
    const b = { userId: "user_b", name: "Bob" };
    assert.equal(distinctAuthorCount([userMsg(a), userMsg(), userMsg(b)]), 2);
  });

  it("does not count assistant messages", () => {
    const a = { userId: "user_a", name: "Ada" };
    assert.equal(distinctAuthorCount([userMsg(a), agentMsg()]), 1);
  });
});

describe("isOwnMessage", () => {
  const ada = { userId: "user_a", name: "Ada" };

  it("treats an authorless message as the viewer's own (single-player)", () => {
    assert.equal(isOwnMessage(undefined, "user_a"), true);
  });

  it("treats every message as own while the viewer is unknown", () => {
    // Guessing "teammate" here would left-align the viewer's own bubbles and
    // snap them right the moment the session resolves.
    assert.equal(isOwnMessage(ada, undefined), true);
  });

  it("is own when the author is the viewer", () => {
    assert.equal(isOwnMessage(ada, "user_a"), true);
  });

  it("is not own when somebody else wrote it", () => {
    assert.equal(isOwnMessage(ada, "user_z"), false);
  });
});

describe("isPeerRow", () => {
  const ada = { userId: "user_a", name: "Ada" };

  it("mirrors a teammate's turn to the left", () => {
    assert.equal(isPeerRow(userMsg(ada), "user_z"), true);
  });

  it("keeps the viewer's own turn on the right", () => {
    assert.equal(isPeerRow(userMsg(ada), "user_a"), false);
  });

  it("keeps an authorless turn on the right (single player is untouched)", () => {
    assert.equal(isPeerRow(userMsg(undefined), "user_a"), false);
  });

  it("keeps every turn on the right while the viewer is unknown", () => {
    assert.equal(isPeerRow(userMsg(ada), undefined), false);
  });

  it("never mirrors an agent turn — it has no bubble to mirror", () => {
    assert.equal(isPeerRow(agentMsg(), "user_z"), false);
  });

  it("mirrors a lone teammate's thread even though nothing is labelled", () => {
    // The regression: `showSenders` is undefined (capabilities still loading,
    // or the legacy heuristic), and the thread holds ONE author who is not the
    // viewer — so `distinctAuthorCount` is 1 and no name is printed. The side
    // must still follow the writer, or a teammate's words render inside the
    // viewer's own bubble and then jump left when pagination reveals a second
    // author.
    const thread = [userMsg(ada, "m1"), userMsg(ada, "m2")];
    const showSenders = undefined;
    const showAuthorLabels = showSenders ?? distinctAuthorCount(thread) >= 2;
    assert.equal(showAuthorLabels, false);
    for (const message of thread) {
      assert.equal(isPeerRow(message, "user_z"), true);
    }
  });
});

describe("announcesSelfAuthorship", () => {
  const ada = { userId: "user_a", name: "Ada" };

  it("announces the viewer's own authored turn", () => {
    assert.equal(announcesSelfAuthorship(userMsg(ada), "user_a", true), true);
  });

  it("stays silent on an AUTHORLESS turn — there is no authorship to claim", () => {
    // It lays out as "own" (nobody else could have written it), but a screen
    // reader must not be told the viewer wrote something the transcript does
    // not attribute to anyone.
    assert.equal(
      announcesSelfAuthorship(userMsg(undefined), "user_a", true),
      false,
    );
  });

  it("stays silent while the viewer is unknown", () => {
    // Layout treats an unresolved viewer as "own" defensively; an
    // announcement cannot be guessed the same way.
    assert.equal(announcesSelfAuthorship(userMsg(ada), undefined, true), false);
  });

  it("stays silent on a teammate's turn (their name is on screen instead)", () => {
    assert.equal(announcesSelfAuthorship(userMsg(ada), "user_z", true), false);
  });

  it("stays silent when the conversation attributes nobody", () => {
    assert.equal(announcesSelfAuthorship(userMsg(ada), "user_a", false), false);
  });

  it("stays silent on an agent turn", () => {
    assert.equal(announcesSelfAuthorship(agentMsg(), "user_a", true), false);
  });
});

describe("senderNameFor", () => {
  const ada = { userId: "user_a", name: "Ada" };

  it("returns null for an authorless message (nobody to name)", () => {
    assert.equal(senderNameFor(undefined, "user_a"), null);
  });

  it("NEVER names the viewer's own message", () => {
    // The self line is gone: a group chat labels who you talk to, not you.
    assert.equal(senderNameFor(ada, "user_a"), null);
  });

  it("returns null while the viewer is unknown", () => {
    assert.equal(senderNameFor(ada, undefined), null);
  });

  it("shows a teammate's display name", () => {
    assert.equal(senderNameFor(ada, "user_z"), "Ada");
  });

  it("falls back to the userId when a teammate has no name", () => {
    assert.equal(senderNameFor({ userId: "user_b" }, "user_z"), "user_b");
  });

  it("never prints a raw UUID at a non-technical reader", () => {
    const nameless = { userId: "8f14e45f-ceea-467a-9e8a-2f4d6b1c0a37" };
    assert.equal(senderNameFor(nameless, "user_z"), "8f14e45f");
  });
});

describe("senderRunKey", () => {
  it("keys a user message on its author", () => {
    assert.equal(senderRunKey(userMsg({ userId: "user_a" })), "user:user_a");
  });

  it("keys an authorless user message on the empty id", () => {
    assert.equal(senderRunKey(userMsg()), "user:");
  });

  it("keys every assistant turn on the one agent", () => {
    assert.equal(senderRunKey(agentMsg("x")), AGENT_RUN_KEY);
    assert.equal(senderRunKey(agentMsg("y")), AGENT_RUN_KEY);
  });

  it("gives a system message a key unique to itself, so it always breaks", () => {
    assert.notEqual(
      senderRunKey(systemMsg("s1")),
      senderRunKey(systemMsg("s2")),
    );
  });
});

describe("senderRunStarts", () => {
  const ada = { userId: "user_a", name: "Ada" };
  const bo = { userId: "user_b", name: "Bo" };

  it("marks the only message of a one-message conversation", () => {
    const items = rows(userMsg(ada, "m1"));
    assert.deepEqual([...senderRunStarts(items)], ["m1"]);
  });

  it("is empty for an empty conversation", () => {
    assert.equal(senderRunStarts([]).size, 0);
  });

  it("names a sender once per run, not once per message", () => {
    const items = rows(
      userMsg(ada, "m1"),
      userMsg(ada, "m2"),
      userMsg(ada, "m3"),
    );
    assert.deepEqual([...senderRunStarts(items)], ["m1"]);
  });

  it("breaks the run when the sender changes", () => {
    const items = rows(
      userMsg(ada, "m1"),
      userMsg(bo, "m2"),
      userMsg(bo, "m3"),
      userMsg(ada, "m4"),
    );
    assert.deepEqual([...senderRunStarts(items)], ["m1", "m2", "m4"]);
  });

  it("re-introduces a sender who comes back after somebody else", () => {
    const items = rows(
      userMsg(ada, "m1"),
      userMsg(bo, "m2"),
      userMsg(ada, "m3"),
    );
    assert.deepEqual([...senderRunStarts(items)], ["m1", "m2", "m3"]);
  });

  it("interleaves humans and the agent, each starting its own run", () => {
    const items = rows(
      userMsg(ada, "m1"),
      agentMsg("m2"),
      agentMsg("m3"),
      userMsg(bo, "m4"),
      agentMsg("m5"),
    );
    assert.deepEqual([...senderRunStarts(items)], ["m1", "m2", "m4", "m5"]);
  });

  it("lets the agent introduce itself after its own tool work", () => {
    // ask -> [tools] -> reply: the process block renders no sender line, so it
    // must not swallow the agent's introduction on the reply.
    const items: ChatDisplayItem[] = [
      ...rows(userMsg(ada, "m1")),
      processRow("p1", 1),
      { kind: "message", message: agentMsg("m2"), sourceIndex: 2 },
    ];
    assert.deepEqual([...senderRunStarts(items)], ["m1", "m2"]);
  });

  it("keeps one agent run across a mid-turn tool block", () => {
    const items: ChatDisplayItem[] = [
      { kind: "message", message: agentMsg("m1"), sourceIndex: 0 },
      processRow("p1", 1),
      { kind: "message", message: agentMsg("m2"), sourceIndex: 2 },
    ];
    assert.deepEqual([...senderRunStarts(items)], ["m1"]);
  });

  it("breaks a run across a system divider", () => {
    const items = rows(userMsg(ada, "m1"), systemMsg("m2"), userMsg(ada, "m3"));
    assert.deepEqual([...senderRunStarts(items)], ["m1", "m2", "m3"]);
  });

  it("groups a single-player transcript's authorless user rows", () => {
    const items = rows(userMsg(undefined, "m1"), userMsg(undefined, "m2"));
    assert.deepEqual([...senderRunStarts(items)], ["m1"]);
  });
});
