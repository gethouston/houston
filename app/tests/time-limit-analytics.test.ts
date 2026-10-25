import { deepStrictEqual, ok } from "node:assert";
import { mock, test } from "node:test";
import type { HoustonEvent } from "@houston-ai/core";
import { ALLOWED_PROPS } from "../src/lib/analytics-vocabulary.ts";

const tracked: Array<[string, unknown]> = [];
let receive: (event: HoustonEvent) => void = () => {};
mock.module("react", {
  namedExports: {
    useRef: <T>(value: T) => ({ current: value }),
    useEffect: (effect: () => unknown) => {
      effect();
    },
  },
});
mock.module(new URL("../src/lib/events.ts", import.meta.url).href, {
  namedExports: {
    subscribeHoustonEvents: (handler: typeof receive) => {
      receive = handler;
      return () => {};
    },
  },
});
mock.module(new URL("../src/lib/analytics.ts", import.meta.url).href, {
  namedExports: {
    analytics: {
      track: (event: string, props: unknown) => tracked.push([event, props]),
    },
    classifyAnalyticsError: () => "unknown",
  },
});
mock.module(new URL("../src/lib/tauri.ts", import.meta.url).href, {
  namedExports: { tauriConfig: {} },
});
mock.module(
  new URL("../src/lib/agent-model-overrides.ts", import.meta.url).href,
  { namedExports: { readAgentModelOverrides: async () => ({}) } },
);
const { useAnalyticsSubscriber } = await import(
  "../src/hooks/use-analytics-subscriber.ts"
);

test("reliability counts a time-limited reply as ended with its typed reason, never as a failed task or app error", () => {
  useAnalyticsSubscriber();
  receive({
    type: "SessionStatus",
    data: {
      agent_path: "a",
      session_key: "c",
      status: "completed",
      error: null,
      stop_reason: "turn_time_limit",
    },
  });
  deepStrictEqual(tracked, [
    ["session_completed", { stop_reason: "turn_time_limit" }],
  ]);
  ok(
    ALLOWED_PROPS.has("stop_reason"),
    "the analytics sink must keep the typed stop reason",
  );
});
