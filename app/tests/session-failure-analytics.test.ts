import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { createBurstGate } from "../src/lib/error-burst.ts";
import {
  createSessionFailureTracker,
  SESSION_ERROR_SHOWN_WINDOW_MS,
  type SessionErrorData,
} from "../src/lib/session-failure-analytics.ts";

const status = (over: Partial<SessionErrorData>): SessionErrorData => ({
  agent_path: "Houston/Bo",
  session_key: "c1",
  error: "Something went wrong. Please try again.",
  ...over,
});

describe("session failure analytics", () => {
  it("counts an unexplained failure as failed AND shown, by class", () => {
    const track = createSessionFailureTracker();
    deepStrictEqual(
      track(status({ error_class: "unexplained", origin: "sent" }), 0),
      [
        {
          event: "session_failed",
          props: {
            error_kind: "unknown",
            error_class: "unexplained",
            origin: "sent",
          },
        },
        {
          event: "app_error_shown",
          props: {
            source: "session",
            error_kind: "unknown",
            error_class: "unexplained",
            origin: "sent",
          },
        },
      ],
    );
  });

  it("counts a handled state as a failed turn, never as an error shown", () => {
    const track = createSessionFailureTracker();
    for (const [error_class, error] of [
      ["engine_restart", "Your agent had to restart. Say continue."],
      ["provider_rate_limited", null],
      ["send_busy", "The agent is still busy with another message."],
    ] as const)
      deepStrictEqual(
        track(status({ error_class, error }), 0).map((e) => e.event),
        ["session_failed"],
        error_class,
      );
  });

  it("maps a copy-less provider card to its legacy bucket, never to unknown", () => {
    const track = createSessionFailureTracker();
    deepStrictEqual(
      track(status({ error_class: "provider_rate_limited", error: null }), 0),
      [
        {
          event: "session_failed",
          props: {
            error_kind: "provider",
            error_class: "provider_rate_limited",
          },
        },
      ],
    );
    deepStrictEqual(
      track(
        status({ error_class: "provider_unauthenticated", error: null }),
        0,
      ).map((e) => e.props.error_kind),
      ["auth"],
    );
    deepStrictEqual(
      track(status({ error_class: "provider_unknown", error: null }), 0).map(
        (e) => [e.event, e.props.error_kind],
      ),
      [
        ["session_failed", "provider"],
        ["app_error_shown", "provider"],
      ],
    );
  });

  it("counts nothing for a turn the person stopped", () => {
    const track = createSessionFailureTracker();
    deepStrictEqual(
      track(status({ error_class: "stopped", error: null }), 0),
      [],
    );
  });

  it("collapses one problem per conversation to one shown error an hour", () => {
    const track = createSessionFailureTracker(
      createBurstGate(SESSION_ERROR_SHOWN_WINDOW_MS),
    );
    const data = status({ error_class: "turn_died", origin: "observed" });
    const events = (now: number) => track(data, now).map((e) => e.event);
    deepStrictEqual(events(0), ["session_failed", "app_error_shown"]);
    deepStrictEqual(events(15 * 60_000), ["session_failed"]);
    deepStrictEqual(events(30 * 60_000), ["session_failed"]);
    deepStrictEqual(
      track({ ...data, session_key: "c2" }, 31 * 60_000).map((e) => e.event),
      ["session_failed", "app_error_shown"],
    );
    deepStrictEqual(
      track({ ...data, error_class: "stream_lost" }, 32 * 60_000).map(
        (e) => e.event,
      ),
      ["session_failed", "app_error_shown"],
    );
    deepStrictEqual(events(32 * 60_000 + SESSION_ERROR_SHOWN_WINDOW_MS + 1), [
      "session_failed",
      "app_error_shown",
    ]);
  });

  it("keeps the legacy copy bucket and tolerates an unclassed status", () => {
    const track = createSessionFailureTracker();
    deepStrictEqual(
      track(status({ error: "Load failed", error_class: "not-a-class" }), 0),
      [
        { event: "session_failed", props: { error_kind: "network" } },
        {
          event: "app_error_shown",
          props: { source: "session", error_kind: "network" },
        },
      ],
    );
    deepStrictEqual(track(status({ error: null }), 0), []);
  });
});
