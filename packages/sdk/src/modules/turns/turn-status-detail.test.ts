import type { WireFrame } from "@houston/runtime-client";
import { expect, test } from "vitest";
import { adoptReply } from "./adopt-reply";
import type { FeedOutput } from "./feed-output";
import { MultiplexFeedOutput } from "./feed-output-multiplex";
import { COMPUTE_BUSY_MESSAGE } from "./send-busy";
import { settleFromHistory } from "./settle-from-history";
import { SEND_LOST_MESSAGE, STREAM_LOST_MESSAGE } from "./stream-tuning";
import type { SessionStatusDetail } from "./turn-error-class";
import {
  ENGINE_RESTART_MESSAGE,
  STOPPED_BY_USER,
  TURN_DIED_MESSAGE,
  TURN_FAILED_MESSAGE,
} from "./turn-errors";
import {
  AGENT_SETUP_FAILED_MESSAGE,
  AGENT_TOO_LARGE_MESSAGE,
  finishGone,
  finishSetupError,
  TURN_UNCONFIRMED_MESSAGE,
} from "./turn-notices";
import { SEND_BUSY_MESSAGE } from "./turn-running";
import {
  finishErr,
  finishOk,
  finishPlanLimit,
  newTurnState,
  settleProviderErrorCard,
} from "./turn-settle";
import { TurnSink } from "./turn-sink";
import { turnErrorClass } from "./turn-state";

type Status = [string, string | undefined, SessionStatusDetail | undefined];

function recorder() {
  const statuses: Status[] = [];
  const output: FeedOutput = {
    pushFeedItem: () => {},
    sessionStatus: (_a, _s, status, error, detail) => {
      statuses.push([status, error, detail]);
    },
    persistBoardStatus: async () => {},
  };
  return { statuses, output };
}

function errored(
  msg: string,
  notice?: Parameters<typeof finishErr>[2],
): Status {
  const { statuses, output } = recorder();
  finishErr(newTurnState("Houston/Bo", "c1", output), msg, notice);
  return statuses[statuses.length - 1];
}

test.each([
  [STOPPED_BY_USER, undefined, "stopped"],
  [ENGINE_RESTART_MESSAGE, "engine_restart", "engine_restart"],
  [SEND_BUSY_MESSAGE, "send_busy", "send_busy"],
  [COMPUTE_BUSY_MESSAGE, "compute_busy", "compute_busy"],
  [TURN_DIED_MESSAGE, undefined, "turn_died"],
  [SEND_LOST_MESSAGE, undefined, "send_lost"],
  [STREAM_LOST_MESSAGE, undefined, "stream_lost"],
  [AGENT_TOO_LARGE_MESSAGE, "agent_too_large", "agent_too_large"],
  [AGENT_SETUP_FAILED_MESSAGE, "agent_setup_failed", "agent_setup_failed"],
  [TURN_UNCONFIRMED_MESSAGE, "turn_unconfirmed", "turn_unconfirmed"],
  [TURN_FAILED_MESSAGE, undefined, "unexplained"],
  ["Model refused the request.", undefined, "engine_verdict"],
] as const)("finishErr(%j, %j) stamps %s", (msg, notice, errorClass) => {
  const [status, error, detail] = errored(msg, notice);
  expect(status).toBe("error");
  expect(detail).toEqual({ origin: "sent", errorClass });
  expect(error).toBe(errorClass === "stopped" ? undefined : msg);
});

test("the setup settles class by code, the lost-after-202 bound as unconfirmed", () => {
  const { statuses, output } = recorder();
  finishSetupError(newTurnState("Houston/Bo", "c1", output), {
    code: "hydrate_over_cap",
    detail: "12 MiB",
  });
  finishSetupError(newTurnState("Houston/Bo", "c2", output), {
    code: "layout_unexpected",
  });
  finishGone(newTurnState("Houston/Bo", "c3", output));
  expect(statuses.map((s) => [s[0], s[1], s[2]])).toEqual([
    [
      "error",
      AGENT_TOO_LARGE_MESSAGE,
      { origin: "sent", errorClass: "agent_too_large" },
    ],
    [
      "error",
      AGENT_SETUP_FAILED_MESSAGE,
      { origin: "sent", errorClass: "agent_setup_failed" },
    ],
    [
      "error",
      TURN_UNCONFIRMED_MESSAGE,
      { origin: "sent", errorClass: "turn_unconfirmed" },
    ],
  ]);
});

test("a not-connected refusal settles as the provider card's class", () => {
  const [status, error, detail] = errored(
    "No provider connected. Log in with Claude or Codex first.",
  );
  expect(status).toBe("error");
  expect(error).toBeUndefined();
  expect(detail).toEqual({
    origin: "sent",
    errorClass: "provider_unauthenticated",
  });
});

test("a typed provider card and a plan refusal carry their kind", () => {
  const { statuses, output } = recorder();
  settleProviderErrorCard(newTurnState("Houston/Bo", "c1", output), {
    kind: "rate_limited",
    provider: "anthropic",
    model: null,
    retry_after_seconds: 30,
    message: "slow down",
  });
  finishPlanLimit(newTurnState("Houston/Bo", "c2", output), {
    code: "message_limit",
    limit: 50,
    resetsAt: "2026-10-10T00:00:00Z",
    error: "limit",
  });
  expect(statuses.map((s) => s[2]?.errorClass)).toEqual([
    "provider_rate_limited",
    "provider_plan_message_limit",
  ]);
});

test("a clean settle carries the origin and no class; an observer's is observed", () => {
  const { statuses, output } = recorder();
  finishOk(newTurnState("Houston/Bo", "c1", output));
  finishOk(newTurnState("Houston/Bo", "c2", output, { mode: "observer" }));
  finishErr(
    newTurnState("Houston/Bo", "c3", output, { mode: "observer" }),
    TURN_DIED_MESSAGE,
  );
  expect(statuses).toEqual([
    ["completed", undefined, { origin: "sent" }],
    ["completed", undefined, { origin: "observed" }],
    [
      "error",
      TURN_DIED_MESSAGE,
      { origin: "observed", errorClass: "turn_died" },
    ],
  ]);
});

test("the multiplexer forwards the detail to every output", () => {
  const a = recorder();
  const b = recorder();
  finishErr(
    newTurnState(
      "Houston/Bo",
      "c1",
      new MultiplexFeedOutput([a.output, b.output]),
    ),
    SEND_LOST_MESSAGE,
  );
  const detail = { origin: "sent", errorClass: "send_lost" };
  expect(a.statuses[0]?.[2]).toEqual(detail);
  expect(b.statuses[0]?.[2]).toEqual(detail);
});

test("a notice kind the error settle never carries falls through to the copy", () => {
  expect(turnErrorClass("Model refused the request.", "engine_resumed")).toBe(
    "engine_verdict",
  );
});

test("the history settles class a dead turn and an engine restart", () => {
  const { statuses, output } = recorder();
  const dead = newTurnState("Houston/Bo", "c1", output);
  dead.delivered = true;
  settleFromHistory(
    dead,
    [{ role: "user", content: "hi", ts: 1, turnId: "t-1" }],
    "t-1",
    () => false,
  );
  adoptReply(newTurnState("Houston/Bo", "c2", output), {
    role: "assistant",
    content: "",
    ts: 2,
    turnId: "t-2",
    interrupted: { cause: "engine_restart" },
  });
  expect(statuses.map((s) => [s[0], s[2]?.errorClass])).toEqual([
    ["error", "turn_died"],
    ["error", "engine_restart"],
  ]);
});

test("the sink stamps its mode as the origin of every status", () => {
  const { statuses, output } = recorder();
  const sink = (mode: "turn" | "observer") =>
    new TurnSink({
      agentPath: "Houston/Bo",
      sessionKey: mode,
      output,
      mode,
      stop: () => {},
      reloadHistory: async () => [],
      historyGuard: () => false,
    });
  const errorFrame: WireFrame = {
    type: "error",
    data: { message: "Model refused the request." },
  };
  sink("turn").onFrame(errorFrame);
  sink("observer").fail(STREAM_LOST_MESSAGE);
  expect(statuses.map((s) => [s[0], s[2]])).toEqual([
    ["error", { origin: "sent", errorClass: "engine_verdict" }],
    ["error", { origin: "observed", errorClass: "stream_lost" }],
  ]);
});
