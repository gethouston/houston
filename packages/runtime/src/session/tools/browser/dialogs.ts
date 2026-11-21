import type { Dialog } from "playwright-core";
import { BrowserToolError } from "./errors";
import { isClosedError, warnUnlessClosed } from "./live/page-errors";
import { SupersededError, supersedeLooks } from "./look-memory";
import type { BrowserTab } from "./open-tab";
import { redactUrl } from "./redact-url";
import { untrusted } from "./untrusted";

export const DIALOG_ANSWER_MS = 2 * 60_000;

export type DialogKind = "alert" | "confirm" | "prompt";

export interface PendingDialog {
  kind: DialogKind;
  message: string;
  dialog: Dialog;
}

interface DialogState {
  pending: PendingDialog | null;
  timer: NodeJS.Timeout | null;
  waiters: Set<(dialog: PendingDialog) => void>;
  personDriving: boolean;
}

const states = new WeakMap<BrowserTab, DialogState>();

function stateOf(tab: BrowserTab): DialogState {
  let state = states.get(tab);
  if (!state) {
    state = {
      pending: null,
      timer: null,
      waiters: new Set(),
      personDriving: false,
    };
    states.set(tab, state);
  }
  return state;
}

export function watchDialogs(
  tab: BrowserTab,
  answerMs = DIALOG_ANSWER_MS,
): void {
  const state = stateOf(tab);
  tab.context.on("dialog", (dialog) => {
    const kind = dialog.type();
    if (kind === "beforeunload") return settle(dialog.accept());
    if (state.personDriving || state.pending || !isHeld(kind))
      return settle(kind === "alert" ? dialog.accept() : dialog.dismiss());
    const pending: PendingDialog = { kind, message: dialog.message(), dialog };
    state.pending = pending;
    state.timer = setTimeout(() => {
      if (state.pending === pending) clear(state);
      settle(dialog.dismiss());
    }, answerMs);
    state.timer.unref();
    dialog.page()?.once("close", () => {
      if (state.pending === pending) clear(state);
    });
    for (const waiter of state.waiters) waiter(pending);
  });
}

const isHeld = (kind: string): kind is DialogKind =>
  kind === "alert" || kind === "confirm" || kind === "prompt";

function clear(state: DialogState): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  state.pending = null;
}

function settle(answer: Promise<void>): void {
  answer.catch(warnUnlessClosed("answering a dialog"));
}

export function pendingDialog(tab: BrowserTab): PendingDialog | null {
  return states.get(tab)?.pending ?? null;
}

export function setPersonDriving(tab: BrowserTab, driving: boolean): void {
  const state = stateOf(tab);
  state.personDriving = driving;
  const held = driving ? state.pending : null;
  if (!held) return;
  clear(state);
  settle(held.kind === "alert" ? held.dialog.accept() : held.dialog.dismiss());
}

export async function answerDialog(
  tab: BrowserTab,
  accept: boolean,
  text?: string,
): Promise<PendingDialog> {
  const state = stateOf(tab);
  const pending = state.pending;
  if (!pending)
    throw new BrowserToolError(
      "invalid_action",
      "No dialog is open on the page.",
    );
  clear(state);
  if (accept)
    await pending.dialog.accept(pending.kind === "prompt" ? text : undefined);
  else await pending.dialog.dismiss();
  return pending;
}

export async function dismissPending(tab: BrowserTab): Promise<void> {
  const state = states.get(tab);
  const pending = state?.pending;
  if (!state || !pending) return;
  clear(state);
  await pending.dialog.dismiss().catch((error: unknown) => {
    if (!isClosedError(error)) throw error;
  });
}

export type Raced<T> =
  | { done: true; value: T }
  | { done: false; dialog: PendingDialog };

export async function raceDialog<T>(
  tab: BrowserTab,
  work: () => Promise<T>,
): Promise<Raced<T>> {
  const state = stateOf(tab);
  let opened: (dialog: PendingDialog) => void = () => undefined;
  const dialogOpened = new Promise<PendingDialog>((resolve) => {
    opened = resolve;
  });
  state.waiters.add(opened);
  const running = work();
  try {
    const raced = await Promise.race([
      running.then((value) => ({ done: true as const, value })),
      dialogOpened.then((dialog) => ({ done: false as const, dialog })),
    ]);
    if (!raced.done) {
      supersedeLooks(tab);
      const warn = warnUnlessClosed("an action a dialog interrupted");
      running.catch((error: unknown) => {
        if (!(error instanceof SupersededError)) warn(error);
      });
    }
    return raced;
  } finally {
    state.waiters.delete(opened);
  }
}

export function dialogNotice(pending: PendingDialog): string {
  const how =
    pending.kind === "prompt"
      ? "Answer it with action dialog: accept true (with text for the answer) or false."
      : "Answer it with action dialog: accept true or false.";
  const page = pending.dialog.page();
  const address = page ? `Address: ${redactUrl(page.url())}\n` : "";
  return `A dialog is open (${pending.kind}). The page is frozen until it is answered. ${how}\n${untrusted(`${address}Dialog message: ${pending.message}`)}`;
}

export function dialogOpenError(pending: PendingDialog): BrowserToolError {
  return new BrowserToolError(
    "dialog_open",
    `A ${pending.kind} dialog is open, so the page cannot do anything else until it is answered. Answer it with action dialog first.`,
  );
}
