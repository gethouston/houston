import { describe, expect, it } from "vitest";
import {
  holdsImport,
  importedMessages,
  importedTurnId,
  parseConversationImportRequest,
} from "./conversation-import";

const request = {
  importId: "onboarding:first_run",
  messages: [
    { role: "assistant", content: "Hi Ana! I'm your AI Manager." },
    { role: "user", content: "Retail and e-commerce" },
  ],
};

describe("parseConversationImportRequest", () => {
  it("accepts an import", () => {
    expect(parseConversationImportRequest(request)).toEqual(request);
  });

  it.each([
    ["no importId", { messages: request.messages }],
    ["an importId with spaces", { ...request, importId: "on boarding" }],
    ["no messages", { ...request, messages: [] }],
    [
      "a role no transcript holds",
      { ...request, messages: [{ role: "system", content: "x" }] },
    ],
    [
      "an empty line",
      { ...request, messages: [{ role: "user", content: "  " }] },
    ],
    ["an unknown field", { ...request, turnId: "t1" }],
    ["a non-object", "hello"],
  ])("refuses %s", (_label, body) => {
    expect(parseConversationImportRequest(body)).toBeNull();
  });
});

describe("imported messages", () => {
  it("stamps each message with its own turn id, in order", () => {
    const parsed = parseConversationImportRequest(request);
    if (!parsed) throw new Error("the fixture must parse");
    expect(importedMessages(parsed, 7)).toEqual([
      {
        role: "assistant",
        content: "Hi Ana! I'm your AI Manager.",
        ts: 7,
        turnId: "import:onboarding:first_run:0",
      },
      {
        role: "user",
        content: "Retail and e-commerce",
        ts: 7,
        turnId: "import:onboarding:first_run:1",
      },
    ]);
  });

  it("recognises a transcript that already holds the import", () => {
    const held = [
      { role: "user" as const, content: "hi", ts: 1, turnId: "t1" },
      {
        role: "assistant" as const,
        content: "hello",
        ts: 2,
        turnId: importedTurnId("onboarding:first_run", 0),
      },
    ];
    expect(holdsImport(held, "onboarding:first_run")).toBe(true);
    expect(holdsImport(held, "onboarding:profile")).toBe(false);
    expect(holdsImport(held, "onboarding:first")).toBe(false);
  });
});
