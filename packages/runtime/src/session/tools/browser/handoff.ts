import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { BrowserHandoffEnd } from "@houston/wire-types";
import type { ActingContext } from "../../acting-context";
import { decodeActingAuthor } from "../../attribution";
import type { BrowserAction } from "./actions";
import {
  dialogNotice,
  dialogOpenError,
  pendingDialog,
  raceDialog,
  setPersonDriving,
} from "./dialogs";
import {
  type BrowserDetails,
  BrowserToolError,
  browserFailure,
} from "./errors";
import { clearFenceRefusal } from "./fence-refusals";
import { restoreLayout } from "./live/layout";
import type { HandoffRegistry } from "./live/registry";
import { guardLanding, openUrl, settle } from "./navigate";
import type { BrowserTab } from "./open-tab";
import { redactUrl } from "./redact-url";
import { nextGeneration } from "./refs";
import { pageSnapshot } from "./snapshot";
import { saveState } from "./state-store";
import { checkBrowserUrl } from "./url-policy";

export interface HandoffOptions {
  conversationId: string;
  owner?: string;
  signal?: AbortSignal;
  registry: HandoffRegistry;
  budget: () => number | null;
  touch?: () => void;
}

export function handoffOwner(
  acting: ActingContext | undefined,
): string | undefined {
  return decodeActingAuthor(acting?.actingAs)?.userId ?? acting?.verifiedOwner;
}

export const NO_TIME_LEFT =
  "This task has run too long to hand the browser over now. Tell the person what they need to sign in to, and that sending a new message gives them time to do it.";

export async function runHandoff(
  tab: BrowserTab,
  action: Extract<BrowserAction, { action: "handoff" }>,
  options: HandoffOptions,
): Promise<AgentToolResult<BrowserDetails>> {
  const held = pendingDialog(tab);
  if (held) throw dialogOpenError(held);
  setPersonDriving(tab, true);
  try {
    return await handOver(tab, action, options);
  } finally {
    setPersonDriving(tab, false);
  }
}

async function handOver(
  tab: BrowserTab,
  action: Extract<BrowserAction, { action: "handoff" }>,
  options: HandoffOptions,
): Promise<AgentToolResult<BrowserDetails>> {
  if (action.url) {
    clearFenceRefusal(tab);
    await openUrl(tab, checkBrowserUrl(action.url).href);
    await settle(tab.page);
    await guardLanding(tab);
  }
  const limitMs = options.budget();
  if (limitMs === null)
    return browserFailure("handoff_unavailable", NO_TIME_LEFT);
  const session = options.registry.open({
    conversationId: options.conversationId,
    text: action.text,
    ...(options.owner ? { owner: options.owner } : {}),
    tab,
    limitMs,
    ...(options.touch ? { touch: options.touch } : {}),
  });
  let browserClosed = false;
  const onClose = () => {
    browserClosed = true;
    session.finish("cancelled");
  };
  const onAbort = () => session.finish("cancelled");
  tab.context.on("close", onClose);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  let end: BrowserHandoffEnd;
  try {
    end = await session.ended;
  } finally {
    tab.context.off("close", onClose);
    options.signal?.removeEventListener("abort", onAbort);
  }
  if (browserClosed)
    throw new BrowserToolError(
      "page_error",
      "The browser closed while the person was using it.",
    );
  await restoreLayout(tab);
  await saveState(tab);
  tab.generation = nextGeneration();
  setPersonDriving(tab, false);
  return handoffResult(tab, action.text, end, options.signal);
}

async function handoffResult(
  tab: BrowserTab,
  text: string,
  end: BrowserHandoffEnd,
  signal: AbortSignal | undefined,
): Promise<AgentToolResult<BrowserDetails>> {
  if (end === "cancelled" || signal?.aborted)
    return browserFailure(
      "handoff_cancelled",
      "The person closed the browser without finishing. Ask them in the chat how they want to go on; do not hand over again unless they ask.",
    );
  if (end === "expired")
    return browserFailure(
      "handoff_expired",
      "Nobody finished in time. Tell the person what is still needed and offer to try again when they are ready.",
    );
  await settle(tab.page);
  const held = pendingDialog(tab);
  const look = held
    ? { done: false as const, dialog: held }
    : await raceDialog(tab, () => pageSnapshot(tab));
  const snapshot = look.done
    ? look.value
    : `The page opened a dialog.\n${dialogNotice(look.dialog)}`;
  return {
    content: [
      {
        type: "text",
        text: `The person finished: "${text}". Their sign-ins are saved. Check the page below before going on.\n\n${snapshot}`,
      },
    ],
    details: { ok: true, action: "handoff", url: redactUrl(tab.page.url()) },
  };
}
