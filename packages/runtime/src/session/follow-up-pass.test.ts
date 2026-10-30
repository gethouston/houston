import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { HarnessSession } from "../backends/types";
import {
  type FollowUpPassInput,
  followUpPassSkip,
  recoverFollowUpActions,
} from "./follow-up-pass";
import {
  newInteractionHolder,
  recordQuestions,
  recordSuggestActions,
  recordSuggestReusable,
  runWithInteractionCapture,
} from "./interaction";

/**
 * The follow-up safety net decides on the turn's own facts (clean end, a
 * reply, nothing recorded, an interactive chat) and, when it runs, records
 * the forced call's actions exactly as an in-band `suggest_actions` would.
 */

const ARGS = {
  actions: [
    { id: "a", label: "Otra versión", message: "Haz otra versión" },
    { id: "b", label: "Más corto", message: "Hazlo más corto" },
  ],
};

let report: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  report = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

function sessionAnswering(
  answer: (
    request: Parameters<NonNullable<HarnessSession["oneShotText"]>>[0],
  ) => Promise<string>,
) {
  const oneShotText = vi.fn(answer);
  return {
    session: { oneShotText } as unknown as HarnessSession,
    oneShotText,
  };
}

function input(over: Partial<FollowUpPassInput> = {}): FollowUpPassInput {
  return {
    session: sessionAnswering(async () => JSON.stringify(ARGS)).session,
    interaction: newInteractionHolder(),
    conversationId: "c-1",
    turnId: "t-1",
    planMode: false,
    userText: "Resume esto.",
    assistantText: "Listo, aquí está el resumen.",
    failed: false,
    isStopped: () => false,
    ...over,
  };
}

test("a clean reply with nothing recorded runs once and lands the actions as the done offer", async () => {
  const { session, oneShotText } = sessionAnswering(async () =>
    JSON.stringify(ARGS),
  );
  const interaction = newInteractionHolder();
  await recoverFollowUpActions(input({ session, interaction }));
  expect(oneShotText).toHaveBeenCalledTimes(1);
  expect(oneShotText.mock.calls[0]?.[0].prompt).toBe(
    '{"user":"Resume esto.","reply":"Listo, aquí está el resumen."}',
  );
  expect(interaction.pending).toEqual({
    steps: [{ kind: "suggest_actions", id: "a1", actions: ARGS.actions }],
  });
  // Recorded now, so the same turn never runs it twice.
  expect(followUpPassSkip(input({ session, interaction }))).toBe("answered");
});

test("each skip condition keeps the pass from running", async () => {
  const withQuestion = newInteractionHolder();
  runWithInteractionCapture(withQuestion, () =>
    recordQuestions([{ kind: "question", id: "q1", question: "¿Cuál?" }]),
  );
  const withActions = newInteractionHolder();
  runWithInteractionCapture(withActions, () => recordSuggestActions(ARGS));
  const cases: [Partial<FollowUpPassInput>, string][] = [
    [{ failed: true }, "failed"],
    [{ nextStepSuggestions: false }, "disabled"],
    [{ session: {} as HarnessSession }, "unsupported"],
    [{ planMode: true }, "plan"],
    [{ assistantText: "  \n" }, "no_reply"],
    [{ interaction: withQuestion }, "answered"],
    [{ interaction: withActions }, "answered"],
    [{ conversationId: "routine-r1" }, "routine"],
  ];
  for (const [over, skip] of cases) {
    const { session, oneShotText } = sessionAnswering(async () =>
      JSON.stringify(ARGS),
    );
    const turn = input({ session, ...over });
    expect(followUpPassSkip(turn)).toBe(skip);
    await recoverFollowUpActions(turn);
    expect(oneShotText).not.toHaveBeenCalled();
  }
});

test("a lone suggest_reusable offer still gets actions, composed before it", async () => {
  const interaction = newInteractionHolder();
  runWithInteractionCapture(interaction, () =>
    recordSuggestReusable({
      reusableKind: "skill",
      title: "T",
      rationale: "R",
    }),
  );
  await recoverFollowUpActions(input({ interaction }));
  expect(interaction.pending?.steps.map((s) => s.kind)).toEqual([
    "suggest_actions",
    "suggest_reusable",
  ]);
});

test("a timeout aborts the request, logs, and ends without actions", async () => {
  let signal: AbortSignal | undefined;
  const { session } = sessionAnswering(
    (request) =>
      new Promise((_resolve, reject) => {
        signal = request.signal;
        request.signal.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      }),
  );
  const interaction = newInteractionHolder();
  vi.useFakeTimers();
  const pending = recoverFollowUpActions(
    input({ session, interaction, timeoutMs: 20 }),
  );
  await vi.advanceTimersByTimeAsync(20);
  await pending;
  vi.useRealTimers();
  expect(signal?.aborted).toBe(true);
  expect(interaction.pending).toBeUndefined();
  expect(String(report.mock.calls[0]?.[1])).toContain("timed out after 20 ms");
});

test("a failure, no call, or invalid arguments log and record nothing", async () => {
  const answers: (() => Promise<string>)[] = [
    async () => {
      throw new Error("429 rate limited");
    },
    async () => "not JSON",
    async () => JSON.stringify({ actions: [ARGS.actions[0]] }),
  ];
  for (const answer of answers) {
    const interaction = newInteractionHolder();
    await recoverFollowUpActions(
      input({ session: sessionAnswering(answer).session, interaction }),
    );
    expect(interaction.pending).toBeUndefined();
  }
  const logged = report.mock.calls.map((call: unknown[]) => String(call[1]));
  expect(logged[0]).toContain("429 rate limited");
  expect(logged[1]).toContain("SyntaxError");
  expect(logged[2]).toContain("invalid suggested actions");
});

test("a stop that lands during the pass drops its actions", async () => {
  const interaction = newInteractionHolder();
  await recoverFollowUpActions(input({ interaction, isStopped: () => true }));
  expect(interaction.pending).toBeUndefined();
});

test("a request the user's Stop aborted is not reported as a failure", async () => {
  let stopped = false;
  const { session } = sessionAnswering(async () => {
    stopped = true;
    throw new Error("Request was aborted");
  });
  const interaction = newInteractionHolder();
  await recoverFollowUpActions(
    input({ session, interaction, isStopped: () => stopped }),
  );
  expect(interaction.pending).toBeUndefined();
  expect(report).not.toHaveBeenCalled();
});

test("the request contains only bounded user and visible reply excerpts", async () => {
  const { session, oneShotText } = sessionAnswering(async () =>
    JSON.stringify(ARGS),
  );
  await recoverFollowUpActions(
    input({
      session,
      userText: `user-fixture${"u".repeat(2488)}DROP_USER_TAIL`,
      assistantText: `DROP_REPLY_HEAD${"r".repeat(2487)}reply-fixture`,
    }),
  );
  const request = oneShotText.mock.calls[0]?.[0];
  expect(request?.prompt).toBe(
    JSON.stringify({
      user: `user-fixture${"u".repeat(2488)}`,
      reply: `${"r".repeat(2487)}reply-fixture`,
    }),
  );
  expect(
    (request?.prompt.length ?? 0) + (request?.systemPrompt.length ?? 0),
  ).toBeLessThan(5600);
  expect(request?.prompt).not.toContain("DROP_");
});
