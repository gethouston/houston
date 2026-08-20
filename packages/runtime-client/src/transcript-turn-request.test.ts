import { expect, test } from "vitest";
import { transcriptTurnRequest } from "./transcript-turn-request";

test("builds the strict user turn request", () => {
  const message = {
    role: "user" as const,
    content: "hello",
    ts: 42,
    turnId: "turn/1",
  };
  expect(
    transcriptTurnRequest("https://gateway.test/conversations/c1", {
      kind: "user",
      turnId: "turn/1",
      message,
      title: "Greeting",
      expectedCount: 4,
    }),
  ).toEqual({
    method: "PUT",
    url: "https://gateway.test/conversations/c1/turns/turn%2F1/user",
    body: { message, ts: 42, title: "Greeting", expectedCount: 4 },
  });
});

test("builds the strict assistant turn request", () => {
  const message = {
    role: "assistant" as const,
    content: "hi",
    ts: 43,
    turnId: "turn/1",
  };
  expect(
    transcriptTurnRequest("https://gateway.test/conversations/c1", {
      kind: "assistant",
      turnId: "turn/1",
      message,
    }),
  ).toEqual({
    method: "PUT",
    url: "https://gateway.test/conversations/c1/turns/turn%2F1/assistant",
    body: { message, ts: 43 },
  });
});
