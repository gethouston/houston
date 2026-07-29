import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { chatSenderMode } from "../src/lib/chat-sender-mode.ts";

describe("chatSenderMode", () => {
  it("keeps a viewer-and-agent chat in the classic layout in multiplayer", () => {
    strictEqual(chatSenderMode(["viewer"], "viewer", true), undefined);
  });

  it("forces group presentation when a teammate authored a message", () => {
    strictEqual(chatSenderMode(["viewer", "teammate"], "viewer", true), true);
  });

  it("recognizes multiple people before the viewer profile resolves", () => {
    strictEqual(chatSenderMode(["ada", "bo"], undefined, true), true);
  });

  it("does not force sender presentation outside multiplayer", () => {
    strictEqual(
      chatSenderMode(["viewer", "teammate"], "viewer", false),
      undefined,
    );
  });
});
