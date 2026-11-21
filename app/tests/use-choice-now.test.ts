import { strict as assert } from "node:assert";
import { after, describe, it, mock } from "node:test";
import "./support/dom-env.ts";
import type { BillingChoice } from "@houston/engine-adapter";

const HOUR = 60 * 60 * 1000;
const START = Date.UTC(2026, 9, 23, 2);
mock.timers.enable({ apis: ["setTimeout", "Date"], now: START });
after(() => mock.timers.reset());

const React = await import("react");
const { act, createElement: h } = React;
(globalThis as Record<string, unknown>).React = React;
const { createRoot } = await import("react-dom/client");
const { useChoiceNow } = await import("../src/hooks/use-choice-now.ts");

const choice = (patch: Partial<BillingChoice> = {}): BillingChoice => ({
  needed: true,
  payer: null,
  state: "pending",
  provisional: false,
  cutoverAt: "2026-10-23T05:00:00Z",
  changeableUntil: null,
  noticeDismissed: false,
  freeOrgSlug: null,
  paidOrgSlug: null,
  orgs: [],
  ...patch,
});

let seen: number[] = [];
function Probe({ value }: { value: BillingChoice }) {
  seen.push(useChoiceNow(value));
  return null;
}

describe("useChoiceNow", () => {
  it("re-renders exactly at the cutover after a new choice arrives", async () => {
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(h(Probe, { value: choice() })));
    await act(async () => mock.timers.tick(HOUR));
    await act(async () =>
      root.render(h(Probe, { value: choice({ freeOrgSlug: "a" }) })),
    );
    seen = [];
    await act(async () => mock.timers.tick(2 * HOUR - 1));
    assert.ok(seen.every((now) => now < Date.parse("2026-10-23T05:00:00Z")));
    await act(async () => mock.timers.tick(1));
    assert.equal(seen.at(-1), Date.parse("2026-10-23T05:00:00Z"));
    await act(async () => root.unmount());
  });

  it("takes a sooner change window from new data", async () => {
    mock.timers.setTime(START);
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(h(Probe, { value: choice() })));
    const window = "2026-10-23T03:00:00Z";
    await act(async () =>
      root.render(h(Probe, { value: choice({ changeableUntil: window }) })),
    );
    await act(async () => mock.timers.tick(HOUR));
    assert.equal(seen.at(-1), Date.parse(window));
    await act(async () => root.unmount());
  });
});
