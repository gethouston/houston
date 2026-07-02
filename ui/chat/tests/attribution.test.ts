import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { authorLabelFor } from "../src/author-label.ts";
import {
  type ChatMessage,
  distinctAuthorCount,
} from "../src/feed-to-messages.ts";

/** A minimal user ChatMessage carrying an optional author. */
const userMsg = (author?: ChatMessage["author"]): ChatMessage => ({
  key: "u",
  from: "user",
  content: "hi",
  isStreaming: false,
  tools: [],
  fileChanges: [],
  author,
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
    const assistant: ChatMessage = {
      key: "x",
      from: "assistant",
      content: "reply",
      isStreaming: false,
      tools: [],
      fileChanges: [],
    };
    const a = { userId: "user_a", name: "Ada" };
    assert.equal(distinctAuthorCount([userMsg(a), assistant]), 1);
  });
});

describe("authorLabelFor", () => {
  const ada = { userId: "user_a", name: "Ada" };

  it("returns null for an authorless message", () => {
    assert.equal(authorLabelFor(undefined, "viewer", { you: "You" }), null);
  });

  it("hides the viewer's own label when no `you` override is given", () => {
    assert.equal(authorLabelFor(ada, "user_a", undefined), null);
  });

  it("shows the `you` override for the viewer's own message", () => {
    assert.equal(authorLabelFor(ada, "user_a", { you: "You" }), "You");
  });

  it("shows a teammate's display name", () => {
    assert.equal(authorLabelFor(ada, "user_z", { you: "You" }), "Ada");
  });

  it("falls back to the userId when a teammate has no name", () => {
    const nameless = { userId: "user_b" };
    assert.equal(authorLabelFor(nameless, "user_z", { you: "You" }), "user_b");
  });
});
