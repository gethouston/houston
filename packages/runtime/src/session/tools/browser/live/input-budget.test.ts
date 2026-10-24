import { afterEach, expect, test, vi } from "vitest";
import { LiveInput } from "./input";
import { FakeCdp, fakePage, fakeTab } from "./live.test-support";
import { NavigationBudget } from "./navigation-budget";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  vi.restoreAllMocks();
});

/** A page whose Back never commits: it fails once its timeout passes. */
function hungPage() {
  const timeouts: number[] = [];
  const page = {
    ...fakePage("https://hung.test/private?token=abc"),
    goBack: async (options: { timeout: number }) => {
      timeouts.push(options.timeout);
      await sleep(options.timeout);
      throw Object.assign(
        new Error(`page.goBack: Timeout ${options.timeout}ms exceeded.`),
        { name: "TimeoutError" },
      );
    },
  };
  // SAFETY: the live view calls goBack with options; the rest is fakePage's.
  return { page: page as unknown as ReturnType<typeof fakePage>, timeouts };
}

test("a batch's navigations share one budget: Backs on a hung site never hold it several times over", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const { page, timeouts } = hungPage();
  const cdp = new FakeCdp();
  const { tab } = fakeTab([page], () => cdp);
  const input = new LiveInput(tab, 50, new NavigationBudget(100));
  const started = Date.now();
  await input.apply([
    { type: "back" },
    { type: "back" },
    { type: "navigate", url: "https://elsewhere.test/" },
    { type: "text", text: "after" },
  ]);
  expect(Date.now() - started).toBeLessThan(200);
  expect(timeouts).toHaveLength(1);
  expect(timeouts[0]).toBeLessThanOrEqual(100);
  // Input that is not a navigation still reaches the page.
  expect(cdp.sent).toEqual([
    "Page.getNavigationHistory",
    "Input.insertText:after",
  ]);
  const skipped = warn.mock.calls.map((call) => call.join(" ")).join("\n");
  expect(skipped).toContain("skipped 2 navigation(s)");
  expect(skipped).not.toMatch(/elsewhere|hung\.test|token/);
  // The next batch starts with the whole budget again.
  await input.apply([{ type: "back" }]);
  expect(timeouts).toHaveLength(2);
});

test("a navigation's timeout is what the batch has left, never 0 (Playwright's 'no timeout')", () => {
  let now = 0;
  const budget = new NavigationBudget(15_000, () => now);
  budget.restart();
  expect(budget.timeout()).toBe(15_000);
  now = 14_000;
  expect(budget.timeout()).toBe(1_000);
  expect(budget.spent()).toBe(false);
  // A millisecond left (a timer that fired early) can't commit a navigation.
  now = 14_999;
  expect(budget.spent()).toBe(true);
  now = 15_000;
  expect(budget.spent()).toBe(true);
  expect(budget.timeout()).toBe(1);
});
