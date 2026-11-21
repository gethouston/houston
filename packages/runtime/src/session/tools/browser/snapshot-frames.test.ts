import { expect, test } from "vitest";
import type { BrowserTab } from "./open-tab";
import { pageSnapshot } from "./snapshot";

function frame(reads: (string[] | Error)[], detached = false) {
  let calls = 0;
  const state = {
    calls: () => calls,
    isDetached: () => detached,
    locator: () => ({
      evaluateAll: async () => {
        const read = reads[Math.min(calls, reads.length - 1)] ?? [];
        calls += 1;
        if (read instanceof Error) throw read;
        return read;
      },
    }),
  };
  return state;
}

function tabWith(frames: ReturnType<typeof frame>[]): BrowserTab {
  const page = {
    frames: () => frames,
    ariaSnapshot: async () => '- textbox "Password" [ref=e4]: Secret1',
    title: async () => "Sign in",
    url: () => "https://site.test/login?password=Secret1",
    evaluate: async () => 1,
  };
  return { page, generation: 0 } as unknown as BrowserTab;
}

const destroyed = () =>
  new Error(
    "locator.evaluateAll: Execution context was destroyed, most likely because of a navigation",
  );

test("an iframe that detached during the look does not fail the snapshot", async () => {
  const snapshot = await pageSnapshot(
    tabWith([
      frame([["Secret1"]]),
      frame([new Error("frame.evaluateAll: Frame was detached")], true),
    ]),
  );
  expect(snapshot).toContain("[password hidden]");
  expect(snapshot).toContain(
    "Address: https://site.test/login?password=[hidden]",
  );
  expect(snapshot).not.toContain("Secret1");
});

test("an attached iframe that navigated mid-read is read once more, passwords still masked", async () => {
  const navigating = frame([destroyed(), ["Secret1"]]);
  const snapshot = await pageSnapshot(tabWith([frame([[]]), navigating]));
  expect(navigating.calls()).toBe(2);
  expect(snapshot).toContain("[password hidden]");
  expect(snapshot).not.toContain("Secret1");
});

test("a frame still attached whose passwords cannot be read twice fails rather than leak", async () => {
  const broken = frame([new Error("evaluate broke"), new Error("still broke")]);
  await expect(pageSnapshot(tabWith([broken]))).rejects.toThrow("still broke");
  expect(broken.calls()).toBe(2);
});
