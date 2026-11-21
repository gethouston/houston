import { EventEmitter } from "node:events";
import type { Dialog } from "playwright-core";
import { afterEach, expect, test, vi } from "vitest";
import {
  answerDialog,
  dialogNotice,
  dismissPending,
  pendingDialog,
  raceDialog,
  setPersonDriving,
  watchDialogs,
} from "./dialogs";
import { lookEpoch } from "./look-memory";
import type { BrowserTab } from "./open-tab";

afterEach(() => {
  vi.useRealTimers();
});

function fakeTab(answerMs?: number) {
  const context = new EventEmitter();
  const tab = { context } as unknown as BrowserTab;
  watchDialogs(tab, answerMs);
  return { tab, open: (dialog: Dialog) => context.emit("dialog", dialog) };
}

function fakeDialog(type: string, message = "Sure?") {
  const page = new EventEmitter();
  const calls: string[] = [];
  const dialog = {
    type: () => type,
    message: () => message,
    page: () =>
      Object.assign(page, { url: () => "https://site.test/x?token=t" }),
    accept: async (text?: string) => {
      calls.push(text === undefined ? "accept" : `accept:${text}`);
    },
    dismiss: async () => {
      calls.push("dismiss");
    },
  };
  return { dialog: dialog as unknown as Dialog, calls, page };
}

test("a confirm is held until answered; a prompt takes the answer text", async () => {
  const { tab, open } = fakeTab();
  const confirm = fakeDialog("confirm");
  open(confirm.dialog);
  expect(pendingDialog(tab)?.kind).toBe("confirm");
  expect(confirm.calls).toEqual([]);
  await answerDialog(tab, false);
  expect(confirm.calls).toEqual(["dismiss"]);
  expect(pendingDialog(tab)).toBeNull();

  const prompt = fakeDialog("prompt", "Name?");
  open(prompt.dialog);
  await answerDialog(tab, true, "Ada");
  expect(prompt.calls).toEqual(["accept:Ada"]);
});

test("beforeunload is accepted at once; a second dialog meanwhile is dismissed", () => {
  const { tab, open } = fakeTab();
  const leaving = fakeDialog("beforeunload");
  open(leaving.dialog);
  expect(leaving.calls).toEqual(["accept"]);
  expect(pendingDialog(tab)).toBeNull();
  const first = fakeDialog("confirm");
  const second = fakeDialog("confirm");
  open(first.dialog);
  open(second.dialog);
  expect(second.calls).toEqual(["dismiss"]);
  expect(pendingDialog(tab)?.dialog).toBe(first.dialog);
});

test("while a person drives the page, alerts are accepted and the rest dismissed", () => {
  const { tab, open } = fakeTab();
  setPersonDriving(tab, true);
  const alert = fakeDialog("alert");
  const confirm = fakeDialog("confirm");
  open(alert.dialog);
  open(confirm.dialog);
  expect(alert.calls).toEqual(["accept"]);
  expect(confirm.calls).toEqual(["dismiss"]);
  expect(pendingDialog(tab)).toBeNull();
});

test("a dialog nobody answers is dismissed after the wait", () => {
  vi.useFakeTimers();
  const { tab, open } = fakeTab(1_000);
  const confirm = fakeDialog("confirm");
  open(confirm.dialog);
  vi.advanceTimersByTime(999);
  expect(pendingDialog(tab)).not.toBeNull();
  vi.advanceTimersByTime(1);
  expect(confirm.calls).toEqual(["dismiss"]);
  expect(pendingDialog(tab)).toBeNull();
});

test("a dialog whose page closed is forgotten; closing the tab dismisses one", async () => {
  const { tab, open } = fakeTab();
  const gone = fakeDialog("alert");
  open(gone.dialog);
  gone.page.emit("close");
  expect(pendingDialog(tab)).toBeNull();
  const held = fakeDialog("confirm");
  open(held.dialog);
  await dismissPending(tab);
  expect(held.calls).toEqual(["dismiss"]);
});

test("an action is cut short by a dialog, and its looks are superseded", async () => {
  const { tab, open } = fakeTab();
  const before = lookEpoch(tab);
  const confirm = fakeDialog("confirm", "Delete?");
  let finish: () => void = () => undefined;
  const raced = raceDialog(
    tab,
    () =>
      new Promise<string>((resolve) => {
        finish = () => resolve("late");
      }),
  );
  open(confirm.dialog);
  const result = await raced;
  expect(result.done).toBe(false);
  expect(lookEpoch(tab)).toBe(before + 1);
  finish();
  expect(await raceDialog(tab, async () => "quick")).toEqual({
    done: true,
    value: "quick",
  });
});

test("the notice fences the page's message and redacts its address", () => {
  const { tab, open } = fakeTab();
  open(fakeDialog("confirm", "Wire $500?").dialog);
  const pending = pendingDialog(tab);
  if (!pending) throw new Error("no dialog held");
  const notice = dialogNotice(pending);
  expect(notice).toMatch(/^A dialog is open \(confirm\)\./);
  expect(notice).toContain("Address: https://site.test/x?token=[hidden]");
  expect(notice).toContain(
    "Dialog message: Wire $500?\n<<<end website content>>>",
  );
});

test("a dialog held when the person takes over is answered for them at once", async () => {
  const { tab, open } = fakeTab();
  const confirm = fakeDialog("confirm");
  open(confirm.dialog);
  setPersonDriving(tab, true);
  await Promise.resolve();
  expect(confirm.calls).toEqual(["dismiss"]);
  expect(pendingDialog(tab)).toBeNull();
  setPersonDriving(tab, false);
});
