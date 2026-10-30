import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routineRunPreamble } from "@houston/domain";
import type { ChatMessage } from "@houston/runtime-client";
import { expect, test, vi } from "vitest";
import {
  DIGEST_TOKEN_BUDGET,
  renderRoutineDigest,
  renderRoutineResults,
  routineTurns,
} from "./routine-digest";
import { replayForConversation, routineReplay } from "./routine-replay";
import { estimateTokens } from "./token-estimate";

const PROMPT = `${routineRunPreamble("Digest")}Summarize the new support tickets.`;
const at = (hour: number, minute = 0) => Date.UTC(2026, 9, 30, hour, minute);
const POINTER = ".houston/runtime/sessions/routine-digest/routine-results.md";

function turn(
  turnId: string,
  ts: number,
  reply: Partial<ChatMessage>,
  content = PROMPT,
): ChatMessage[] {
  return [
    { role: "user", content, ts, turnId },
    { role: "assistant", content: "", ts: ts + 60_000, turnId, ...reply },
  ];
}

const LONG_REPLY = `Run 6: ${"ticket waiting;\n".repeat(50)}`;

/** Six fires, one failed, and a person's message between the last two. */
const CHAT: ChatMessage[] = [
  ...[0, 1, 2].flatMap((n) =>
    turn(`r${n}`, at(8 + n), { content: `Run ${n}: ${n} new tickets.` }),
  ),
  ...turn("r3", at(11), {
    providerError: {
      kind: "context_overflow",
      provider: "anthropic",
      model: "claude-opus-5",
      context_window_tokens: 200_000,
      prompt_tokens: 204_000,
      message: "Prompt is too long",
    },
  }),
  ...turn("r4", at(12), { content: "Run 4: 4 new tickets,\n\nnone urgent." }),
  ...turn(
    "p1",
    at(12, 30),
    { content: "Will do: Acme has one open ticket." },
    "Also flag anything from Acme.",
  ),
  ...turn("r5", at(13), { content: "Run 5: nothing new." }),
  ...turn("r6", at(14), { content: LONG_REPLY }),
  { role: "user", content: PROMPT, ts: at(15), turnId: "now" },
];

test("a fire's digest lists the newest five turns, each reply cut, then the pointer", () => {
  const digest = renderRoutineDigest(routineTurns(CHAT, "now"), POINTER);

  expect(digest?.text).toBe(
    [
      "[Earlier runs of this automation, newest first. This turn starts without the rest of the chat: these lines are your memory of what earlier runs found and reported, each reply shortened. Use them to avoid repeating work or reports.]",
      `- 2026-10-30T14:00:00.000Z, run, finished: Run 6: ${"ticket waiting; ".repeat(37).trimEnd()}…`,
      "- 2026-10-30T13:00:00.000Z, run, finished: Run 5: nothing new.",
      '- 2026-10-30T12:30:00.000Z, a person wrote "Also flag anything from Acme.", finished: Will do: Acme has one open ticket.',
      "- 2026-10-30T12:00:00.000Z, run, finished: Run 4: 4 new tickets, none urgent.",
      "- 2026-10-30T11:00:00.000Z, run, failed (context_overflow)",
      `The full replies of earlier runs are in the file ${POINTER}, newest first. Read it only if this run needs more than the lines above.`,
      "[End of earlier runs. This turn's message follows.]",
      "",
    ].join("\n"),
  );
  expect(estimateTokens(digest?.text ?? "")).toBeLessThanOrEqual(
    DIGEST_TOKEN_BUDGET,
  );
});

test("the digest drops its oldest lines to stay within its token budget", () => {
  // CJK runs near one token a character: five 600-character excerpts are
  // well over the budget, so the oldest go first.
  const chat = [
    ...Array.from({ length: 10 }, (_, n) =>
      turn(`r${n}`, at(n), {
        content: `第${n}次：${"新的工单需要回复".repeat(80)}`,
      }),
    ).flat(),
    { role: "user" as const, content: PROMPT, ts: at(11), turnId: "now" },
  ];
  const text = renderRoutineDigest(routineTurns(chat, "now"), POINTER)?.text;

  expect(estimateTokens(text ?? "")).toBeLessThanOrEqual(DIGEST_TOKEN_BUDGET);
  expect(text).toContain("第9次");
  expect(text).not.toContain("第5次");
  expect(text).toContain(POINTER);
});

test("turns above a /clear are not carried, and a chat with nothing earlier carries nothing", () => {
  const cleared: ChatMessage[] = [
    ...CHAT.slice(0, 4),
    { role: "user", content: "/clear", ts: at(10, 30), turnId: "c" },
    { role: "assistant", content: "", ts: at(10, 30), contextCleared: true },
    ...turn("r9", at(16), { content: "Run 9: one ticket." }),
    { role: "user", content: PROMPT, ts: at(17), turnId: "now" },
  ];
  const text = renderRoutineDigest(routineTurns(cleared, "now"), null)?.text;
  expect(text).toContain("Run 9: one ticket.");
  expect(text).not.toContain("Run 1:");
  expect(text).not.toContain("full replies");

  const firstFire = [
    { role: "user" as const, content: PROMPT, ts: 1, turnId: "now" },
  ];
  expect(
    renderRoutineDigest(routineTurns(firstFire, "now"), POINTER),
  ).toBeNull();
});

test("the results file holds every earlier turn's whole reply, newest first", () => {
  const results = renderRoutineResults(routineTurns(CHAT.slice(-7), "now"));
  expect(results).toBe(
    [
      "# Earlier runs of this automation",
      "",
      "Newest first. Each section is one earlier turn of the chat with its full final reply.",
      "",
      "## 2026-10-30T14:00:00.000Z, run, finished",
      "",
      `${LONG_REPLY.trim()}`,
      "",
      "## 2026-10-30T13:00:00.000Z, run, finished",
      "",
      "Run 5: nothing new.",
      "",
      "## 2026-10-30T12:30:00.000Z, a person's message, finished",
      "",
      "Message: Also flag anything from Acme.",
      "",
      "Will do: Acme has one open ticket.",
      "",
    ].join("\n"),
  );
});

test("the digest's pointer resolves, from the workspace, to the results file", () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), "routine-digest-ws-"));
  const dataDir = join(workspaceDir, ".houston", "runtime");
  mkdirSync(dataDir, { recursive: true });

  const text = routineReplay(
    { dataDir, workspaceDir, assistantRole: null },
    "routine-digest",
    CHAT,
    "now",
  )?.text;

  expect(text).toContain(`in the file ${POINTER},`);
  const file = readFileSync(join(workspaceDir, POINTER), "utf8");
  expect(file).toBe(renderRoutineResults(routineTurns(CHAT, "now")));
  // The full replies the digest only excerpts, and the runs it left out.
  expect(file).toContain(LONG_REPLY.trim());
  expect(file).toContain("Run 0: 0 new tickets.");
});

test("the AI Manager, whose file wall keeps its session records out, gets no pointer it could not open", () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), "routine-digest-ws-"));
  const dataDir = join(workspaceDir, ".houston", "runtime");
  const text = routineReplay(
    { dataDir, workspaceDir, assistantRole: "coordinator" },
    "routine-digest",
    CHAT,
    "now",
  )?.text;
  expect(text).toContain("Run 5: nothing new.");
  expect(text).not.toContain("full replies");
  expect(existsSync(join(workspaceDir, POINTER))).toBe(false);
});

test("a runtime whose data sits outside the workspace gets the digest without a pointer", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const text = routineReplay(
    {
      dataDir: mkdtempSync(join(tmpdir(), "routine-digest-data-")),
      workspaceDir: mkdtempSync(join(tmpdir(), "routine-digest-ws-")),
      assistantRole: null,
    },
    "routine-digest",
    CHAT,
    "now",
  )?.text;
  expect(text).toContain("Run 5: nothing new.");
  expect(text).not.toContain("full replies");
  expect(console.error).not.toHaveBeenCalled();
});

test("an ordinary chat's replay is exactly the one it always had", () => {
  const replay = replayForConversation({
    conversationId: "chat-1",
    messages: CHAT,
    currentTurnId: "now",
    dirs: { dataDir: tmpdir(), workspaceDir: tmpdir(), assistantRole: null },
    windowTokens: 200_000,
    reason: "reset",
  });
  expect(replay?.text).toContain("[Continuing an existing conversation.");
  expect(replay?.text).toContain("Summarize the new support tickets");
  expect(replay?.text).not.toContain("Earlier runs of this automation");
});
