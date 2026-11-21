import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import type { Locator } from "playwright-core";
import type { BrowserAction } from "./actions";
import type { Block } from "./block-detect";
import {
  answerDialog,
  dialogNotice,
  dialogOpenError,
  pendingDialog,
  raceDialog,
} from "./dialogs";
import { clearFenceRefusal } from "./fence-refusals";
import { lookEpoch, SupersededError } from "./look-memory";
import { guardLanding, openUrl, settle } from "./navigate";
import { readBlock } from "./page-block";
import { pageText } from "./page-text";
import type { BrowserTab } from "./pool";
import { redactUrl } from "./redact-url";
import { resolveRef } from "./refs";
import { screenshot } from "./screenshot";
import { pageSnapshot } from "./snapshot";
import type { SnapshotView } from "./snapshot-view";
import { checkBrowserUrl } from "./url-policy";

const REF_TIMEOUT_MS = 5_000;

export interface ActionOutcome {
  content: (TextContent | ImageContent)[];
  mutated: boolean;
  blocked?: Block;
}

export type PageAction = Exclude<
  BrowserAction,
  { action: "close" | "handoff" }
>;

async function isPasswordField(field: Locator): Promise<boolean> {
  return field.evaluate(
    (el) => el instanceof HTMLInputElement && el.type === "password",
    undefined,
    {
      timeout: REF_TIMEOUT_MS,
    },
  );
}

const text = (value: string): TextContent => ({ type: "text", text: value });

function unlessAborted<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

export async function runBrowserAction(
  tab: BrowserTab,
  action: PageAction,
  signal?: AbortSignal,
  detect = false,
): Promise<ActionOutcome> {
  clearFenceRefusal(tab);
  const pending = pendingDialog(tab);
  if (pending && action.action !== "dialog") {
    if (action.action === "snapshot" || action.action === "screenshot")
      return { content: [text(dialogNotice(pending))], mutated: false };
    throw dialogOpenError(pending);
  }
  const raced = await raceDialog(tab, () =>
    perform(tab, action, signal, detect),
  );
  if (raced.done) return raced.value;
  return {
    content: [
      text(
        `The page opened a dialog during ${action.action}.\n${dialogNotice(raced.dialog)}`,
      ),
    ],
    mutated: false,
  };
}

async function perform(
  tab: BrowserTab,
  action: PageAction,
  signal: AbortSignal | undefined,
  detect: boolean,
): Promise<ActionOutcome> {
  const page = tab.page;
  const epoch = lookEpoch(tab);
  const withSnapshot = async (
    lead: string,
    mutated = true,
    view?: SnapshotView,
  ) => {
    if (lookEpoch(tab) !== epoch) throw new SupersededError();
    await settle(tab.page);
    await guardLanding(tab);
    return {
      content: [text(`${lead}\n\n${await pageSnapshot(tab, view, epoch)}`)],
      mutated,
    };
  };
  const target = (ref: string) => page.getByRef(resolveRef(tab, ref));
  switch (action.action) {
    case "open": {
      const url = checkBrowserUrl(action.url);
      const response = await openUrl(tab, url.href);
      const lead = `Opened ${redactUrl(url.href)}.`;
      const opened = await withSnapshot(lead, true, action.view);
      const blocked = detect ? await readBlock(tab, response) : null;
      return blocked ? { ...opened, blocked } : opened;
    }
    case "snapshot":
      return {
        content: [text(await pageSnapshot(tab, action.view))],
        mutated: false,
      };
    case "text":
      return { content: [text(await pageText(page))], mutated: false };
    case "click":
      await target(action.ref).click({ timeout: REF_TIMEOUT_MS });
      return withSnapshot(`Clicked ${action.ref}.`);
    case "fill": {
      const secret = await isPasswordField(target(action.ref));
      await target(action.ref).fill(action.text, { timeout: REF_TIMEOUT_MS });
      return withSnapshot(
        secret
          ? `Filled the password field ${action.ref}.`
          : `Filled ${action.ref} with "${action.text}".`,
      );
    }
    case "select":
      await target(action.ref).selectOption(action.value, {
        timeout: REF_TIMEOUT_MS,
      });
      return withSnapshot(`Selected "${action.value}" in ${action.ref}.`);
    case "press":
      await page.keyboard.press(action.key);
      return withSnapshot(`Pressed ${action.key}.`);
    case "wait":
      await unlessAborted(
        action.text
          ? page.getByText(action.text).first().waitFor({ timeout: 15_000 })
          : page.waitForTimeout(action.ms ?? 0),
        signal,
      );
      return withSnapshot(
        action.text
          ? `"${action.text}" is on the page.`
          : `Waited ${action.ms} ms.`,
        false,
      );
    case "back":
      await page.goBack({ waitUntil: "domcontentloaded" });
      return withSnapshot("Went back.");
    case "dialog": {
      const answered = await answerDialog(tab, action.accept, action.text);
      return withSnapshot(
        `${action.accept ? "Accepted" : "Dismissed"} the ${answered.kind} dialog.`,
      );
    }
    case "screenshot":
      return screenshot(tab, action.labels);
  }
}
