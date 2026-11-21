import { ok } from "node:assert";
import { describe, it } from "node:test";
import { processScrollPaneClass } from "../src/chat-process-classes.ts";

function tokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

function includes(className: string, token: string): boolean {
  return tokens(className).has(token);
}

describe("chat process scroll pane", () => {
  it("caps the height so the open tool log cannot swallow the chat", () => {
    ok(includes(processScrollPaneClass, "max-h-80"));
  });

  it("scrolls the overflow in place instead of growing the page", () => {
    ok(includes(processScrollPaneClass, "overflow-y-auto"));
  });
});
