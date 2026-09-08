import { expect, test } from "vitest";
import { parseConversationCommand } from "./conversation-command";

test("recognizes the two commands and the compact alias", () => {
  expect(parseConversationCommand("/clear")).toBe("clear");
  expect(parseConversationCommand("/compact")).toBe("compact");
  expect(parseConversationCommand("/compress")).toBe("compact");
});

test("is case-insensitive and tolerates surrounding whitespace", () => {
  expect(parseConversationCommand("  /Clear ")).toBe("clear");
  expect(parseConversationCommand("/COMPACT")).toBe("compact");
  expect(parseConversationCommand("\n/Compress\t")).toBe("compact");
});

test("never hijacks the user's own text: only an exact match commands", () => {
  // The whole point of exact matching. A message that merely CONTAINS or
  // extends a command is the user talking, and talking must always reach the
  // model — silently swallowing it would be the worst possible failure here.
  for (const text of [
    "/clear the kitchen table",
    "please /clear",
    "clear",
    "//clear",
    "/clearing",
    "/compact the report",
    "/unknown",
    "/",
    "",
    "   ",
  ])
    expect(parseConversationCommand(text)).toBeNull();
});
