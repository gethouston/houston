// The shell pill's clock: the notice must change with time alone, across
// many capped waits, with no new provider status (the status query stops
// polling once it has an answer). Mounted in jsdom with mocked timers.

import { strict as assert } from "node:assert";
import { after, describe, it, mock } from "node:test";
import "./support/dom-env.ts";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 9, 1, 12);
mock.timers.enable({ apis: ["setTimeout", "Date"], now: START });
after(() => mock.timers.reset());

const React = await import("react");
const { act, createElement: h } = React;
(globalThis as Record<string, unknown>).React = React;
const { createRoot } = await import("react-dom/client");
const { useReconnectNotice } = await import(
  "../src/hooks/use-reconnect-notice.ts"
);

const statuses = {
  anthropic: {
    provider: "anthropic",
    cli_installed: true,
    auth_state: "authenticated" as const,
    authenticated: true,
    cli_name: "anthropic",
    // The window opens 2 days and 5 hours from now.
    reconnectBy: START + 7 * DAY + 5 * 60 * 60 * 1000,
  },
};

let shown: string[] = [];
function Probe() {
  const notice = useReconnectNotice(statuses);
  shown.push(notice ? String(notice.daysLeft) : "none");
  return null;
}

describe("useReconnectNotice", () => {
  it("opens the window and counts down with no new status", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(h(Probe)));
    assert.equal(shown.at(-1), "none");

    // Fifty-three hours of capped one-hour waits, then the window opens.
    for (let hour = 0; hour < 53; hour++)
      await act(async () => mock.timers.tick(60 * 60 * 1000));
    assert.equal(shown.at(-1), "5");

    shown = [];
    await act(async () => mock.timers.tick(DAY));
    assert.equal(shown.at(-1), "4");
    await act(async () => root.unmount());
  });
});
