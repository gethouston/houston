import { BROWSER_ACTION_NAMES, type BrowserParams } from "./action-schema";
import { BrowserToolError } from "./errors";
import type { SnapshotView } from "./snapshot-view";

export {
  BROWSER_ACTION_NAMES,
  type BrowserParams,
  browserParameters,
} from "./action-schema";

export type BrowserAction =
  | { action: "open"; url: string; view: SnapshotView }
  | { action: "snapshot"; view: SnapshotView }
  | { action: "text" }
  | { action: "back" }
  | { action: "screenshot"; labels: boolean }
  | { action: "close" }
  | { action: "dialog"; accept: boolean; text?: string }
  | { action: "click"; ref: string }
  | { action: "fill"; ref: string; text: string }
  | { action: "select"; ref: string; value: string }
  | { action: "press"; key: string }
  | { action: "wait"; text?: string; ms?: number }
  | { action: "handoff"; text: string; url?: string };

export const MAX_WAIT_MS = 10_000;

function required(params: BrowserParams, field: keyof BrowserParams): string {
  const value = params[field];
  if (typeof value === "string" && value.trim() !== "") return value;
  throw new BrowserToolError(
    "invalid_action",
    `The ${params.action} action needs '${field}'.`,
  );
}

function refOf(params: BrowserParams): string {
  return required(params, "ref")
    .replace(/^\[?(?:ref=)?|\]$/g, "")
    .trim();
}

function viewOf(params: BrowserParams): SnapshotView {
  const query = params.query?.trim();
  return {
    interactive: params.interactive === true,
    links: params.links === true,
    ...(query ? { query } : {}),
  };
}

export function parseBrowserAction(params: BrowserParams): BrowserAction {
  switch (params.action) {
    case "open":
      return {
        action: "open",
        url: required(params, "url"),
        view: viewOf(params),
      };
    case "click":
      return { action: "click", ref: refOf(params) };
    case "fill":
      if (typeof params.text !== "string")
        throw new BrowserToolError(
          "invalid_action",
          "The fill action needs 'text'.",
        );
      return { action: "fill", ref: refOf(params), text: params.text };
    case "select":
      return {
        action: "select",
        ref: refOf(params),
        value: required(params, "value"),
      };
    case "press":
      return { action: "press", key: required(params, "key") };
    case "wait": {
      const text = params.text?.trim();
      if (!text && params.ms === undefined)
        throw new BrowserToolError(
          "invalid_action",
          "The wait action needs 'text' to wait for, or 'ms' to pause.",
        );
      const ms =
        params.ms === undefined
          ? undefined
          : Math.min(Math.max(0, params.ms), MAX_WAIT_MS);
      return {
        action: "wait",
        ...(text ? { text } : {}),
        ...(ms !== undefined ? { ms } : {}),
      };
    }
    case "snapshot":
      return { action: "snapshot", view: viewOf(params) };
    case "text":
      return { action: "text" };
    case "dialog":
      if (typeof params.accept !== "boolean")
        throw new BrowserToolError(
          "invalid_action",
          "The dialog action needs 'accept': true to accept, false to dismiss.",
        );
      return {
        action: "dialog",
        accept: params.accept,
        ...(typeof params.text === "string" ? { text: params.text } : {}),
      };
    case "back":
      return { action: "back" };
    case "screenshot":
      return { action: "screenshot", labels: params.labels === true };
    case "close":
      return { action: "close" };
    case "handoff": {
      const url = params.url?.trim();
      return {
        action: "handoff",
        text: required(params, "text").trim(),
        ...(url ? { url } : {}),
      };
    }
    default:
      throw new BrowserToolError(
        "invalid_action",
        `Unknown action. Use one of: ${BROWSER_ACTION_NAMES.join(", ")}.`,
      );
  }
}
