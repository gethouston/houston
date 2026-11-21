import { strict as assert } from "node:assert";
import type { ReactElement } from "react";
import { win } from "./conversation-log-dom.ts";

export { mountLog, win } from "./conversation-log-dom.ts";

const { act, createElement: h } = await import("react");
const { ChatPanel } = await import("../../src/chat-panel.tsx");
const { ChatInteractionCard } = await import("../../src/interaction-card.tsx");
export type CardProps =
  import("../../src/interaction-card.tsx").ChatInteractionCardProps;
export type Step = CardProps["steps"][number];
export type Answer =
  import("../../src/interaction-card-logic.ts").ChatInteractionAnswer;

export interface Completion {
  answers: Answer[];
  files: File[];
}

export const PICK: Step = {
  kind: "question",
  id: "q-photo",
  question: "Which character?",
  options: [
    { id: "fox", label: "The fox" },
    { id: "owl", label: "The owl" },
  ],
};
export const OPEN: Step = {
  kind: "question",
  id: "q-image",
  question: "Send me its image",
};

export const file = (name: string, type = "image/png") =>
  new win.File(["x"], name, { type }) as unknown as File;

export function deferred() {
  let resolve: (accepted: boolean) => void = () => {};
  const promise = new Promise<boolean>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

export function card(
  steps: Step[],
  done: Completion[],
  extra: Partial<CardProps> & {
    result?: () => Promise<boolean> | undefined;
  } = {},
): ReactElement {
  const { result, ...props } = extra;
  return h(ChatInteractionCard, {
    steps,
    onComplete: (answers: Answer[], files: File[]) => {
      done.push({ answers, files });
      return result?.();
    },
    renderConnect: () => null,
    renderSignin: () => null,
    renderCredential: () => null,
    ...props,
  });
}

export function panel(
  override: ReactElement | null,
  extra: Record<string, unknown> = {},
): ReactElement {
  return h(ChatPanel, {
    sessionKey: "s",
    feedItems: [{ feed_type: "user_message", id: "a", data: "Animate it" }],
    isLoading: false,
    status: "ready",
    onSend: async () => {},
    composerOverrideMode: "replace",
    composerOverride: override,
    ...extra,
  });
}

export const byLabel = (label: string) =>
  win.document.querySelectorAll(`[aria-label="${label}"]`);

export const chips = (name: string) => byLabel(`Remove ${name}`).length;

export function click(el: Element | null | undefined): void {
  assert.ok(el, "element to click is missing");
  act(() => {
    (el as HTMLElement).click();
  });
}

export function option(label: string): Element | undefined {
  return Array.from(win.document.querySelectorAll('[role="radio"]')).find(
    (el) => el.textContent?.includes(label),
  );
}

export function sendButton(): HTMLButtonElement {
  const send = byLabel("Send")[0];
  assert.ok(send, "no Send button");
  return send as HTMLButtonElement;
}

export function attach(files: File[]): void {
  const input = win.document.querySelector(
    'input[type="file"]:not([webkitdirectory])',
  ) as HTMLInputElement | null;
  assert.ok(input, "no file input");
  Object.defineProperty(input, "files", { configurable: true, value: files });
  act(() => {
    input.dispatchEvent(new win.Event("change", { bubbles: true }));
  });
}

export function type(text: string): void {
  const area = win.document.querySelector("textarea") as HTMLTextAreaElement;
  assert.ok(area, "no textarea");
  const setter = Object.getOwnPropertyDescriptor(
    win.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(area, text);
    area.dispatchEvent(new win.Event("input", { bubbles: true }));
  });
}

export function pressEnter(): void {
  const area = win.document.querySelector("textarea") as HTMLTextAreaElement;
  assert.ok(area, "no textarea");
  act(() => {
    area.dispatchEvent(
      new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
}

export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}
