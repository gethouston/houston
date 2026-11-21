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
