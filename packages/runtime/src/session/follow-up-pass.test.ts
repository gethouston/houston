import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type {
  ForcedToolCall,
  ForcedToolCallRequest,
} from "../backends/forced-tool-call";
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

let warn: ReturnType<typeof vi.spyOn>;
let info: ReturnType<typeof vi.spyOn>;
let debug: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

function sessionAnswering(
  answer: (request: ForcedToolCallRequest) => Promise<ForcedToolCall>,
) {
  const forceToolCall = vi.fn(answer);
  return {
    session: { forceToolCall } as unknown as HarnessSession,
    forceToolCall,
  };
}

function input(over: Partial<FollowUpPassInput> = {}): FollowUpPassInput {
  return {
    session: sessionAnswering(async () => ({ outcome: "called", args: ARGS }))
      .session,
    interaction: newInteractionHolder(),
    conversationId: "c-1",
    turnId: "t-1",
    planMode: false,
    assistantText: "Listo, aquí está el resumen.",
    failed: false,
    isStopped: () => false,
    ...over,
  };
}

test("a clean reply with nothing recorded runs once and lands the actions as the done offer", async () => {
  const { session, forceToolCall } = sessionAnswering(async () => ({
    outcome: "called",
    args: ARGS,
  }));
  const interaction = newInteractionHolder();
  await recoverFollowUpActions(input({ session, interaction }));
  expect(forceToolCall).toHaveBeenCalledTimes(1);
  expect(forceToolCall.mock.calls[0]?.[0].toolName).toBe("suggest_actions");
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
    [{ session: {} as HarnessSession }, "unsupported"],
    [{ planMode: true }, "plan"],
    [{ assistantText: "  \n" }, "no_reply"],
    [{ interaction: withQuestion }, "answered"],
    [{ interaction: withActions }, "answered"],
    [{ conversationId: "routine-r1" }, "routine"],
  ];
  for (const [over, skip] of cases) {
    const { session, forceToolCall } = sessionAnswering(async () => ({
      outcome: "called",
      args: ARGS,
    }));
    const turn = input({ session, ...over });
    expect(followUpPassSkip(turn)).toBe(skip);
    await recoverFollowUpActions(turn);
    expect(forceToolCall).not.toHaveBeenCalled();
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
  const started = performance.now();
  await recoverFollowUpActions(input({ session, interaction, timeoutMs: 20 }));
  expect(performance.now() - started).toBeLessThan(1_000);
  expect(signal?.aborted).toBe(true);
  expect(interaction.pending).toBeUndefined();
  expect(String(warn.mock.calls[0]?.[0])).toContain("timed out after 20 ms");
});

test("a failure, no call, or invalid arguments log and record nothing", async () => {
  const answers: (() => Promise<ForcedToolCall>)[] = [
    async () => {
      throw new Error("429 rate limited");
    },
    async () => ({ outcome: "not_called" }),
    async () => ({ outcome: "called", args: { actions: [ARGS.actions[0]] } }),
  ];
  for (const answer of answers) {
    const interaction = newInteractionHolder();
    await recoverFollowUpActions(
      input({ session: sessionAnswering(answer).session, interaction }),
    );
    expect(interaction.pending).toBeUndefined();
  }
  const logged = warn.mock.calls.map((call: unknown[]) => String(call[0]));
  expect(logged[0]).toContain("failed: 429 rate limited");
  expect(logged[1]).toContain("did not call suggest_actions");
  expect(logged[2]).toContain("arguments were invalid");
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
  expect(warn).not.toHaveBeenCalled();
});

test("a model that cannot be forced skips quietly: one debug line, nothing recorded", async () => {
  const { session, forceToolCall } = sessionAnswering(async () => ({
    outcome: "unsupported",
    reason: "amazon-bedrock over bedrock-converse-stream",
  }));
  const interaction = newInteractionHolder();
  await recoverFollowUpActions(input({ session, interaction }));
  expect(forceToolCall).toHaveBeenCalledTimes(1);
  expect(interaction.pending).toBeUndefined();
  expect(warn).not.toHaveBeenCalled();
  expect(info).not.toHaveBeenCalled();
  expect(debug).toHaveBeenCalledTimes(1);
  expect(String(debug.mock.calls[0]?.[0])).toContain("not forceable");
});
