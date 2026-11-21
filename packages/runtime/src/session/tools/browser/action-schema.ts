import { Type } from "typebox";

const PAGE_ACTIONS = [
  "open",
  "snapshot",
  "text",
  "click",
  "fill",
  "select",
  "press",
  "wait",
  "back",
  "screenshot",
  "dialog",
  "close",
] as const;

export const BROWSER_ACTION_NAMES = [...PAGE_ACTIONS, "handoff"] as const;
export type BrowserActionName = (typeof BROWSER_ACTION_NAMES)[number];

const ACTIONS_LEAD =
  "open a url; snapshot the page's elements with their refs; text: read the page's text; click/fill/select an element by ref; press a key; wait for text or a pause; back; screenshot; dialog: answer a dialog the page opened; close the browser (saves sign-ins)";

export function browserParameters({ handoff }: { handoff: boolean }) {
  const names: readonly BrowserActionName[] = handoff
    ? BROWSER_ACTION_NAMES
    : PAGE_ACTIONS;
  return Type.Object({
    action: Type.Union(
      names.map((name) => Type.Literal(name)),
      {
        description: handoff
          ? `${ACTIONS_LEAD}; handoff: let the person use this browser themselves (to sign in, enter a code, or solve a captcha) and wait until they finish. Never to show them an error or a blocked page.`
          : `${ACTIONS_LEAD}.`,
      },
    ),
    url: Type.Optional(
      Type.String({
        description: handoff
          ? "For open. For handoff: optionally, the page to show the person first."
          : "For open.",
      }),
    ),
    ref: Type.Optional(
      Type.String({
        description:
          "For click/fill/select: the element's ref from the LATEST snapshot, exactly as printed, e.g. s3e12.",
      }),
    ),
    text: Type.Optional(
      Type.String({
        description: handoff
          ? "For fill: what to type. For wait: text to wait for. For dialog: the answer to a prompt. For handoff: what the person needs to do, in one short sentence they will read."
          : "For fill: what to type. For wait: text to wait for. For dialog: the answer to a prompt.",
      }),
    ),
    value: Type.Optional(
      Type.String({ description: "For select: the option to pick." }),
    ),
    key: Type.Optional(
      Type.String({
        description: "For press: a key such as Enter, Tab, Escape.",
      }),
    ),
    ms: Type.Optional(
      Type.Number({
        description: "For wait: milliseconds to pause (max 10000).",
      }),
    ),
    interactive: Type.Optional(
      Type.Boolean({
        description:
          "For snapshot/open: only the controls (buttons, links, fields) and the headings around them.",
      }),
    ),
    query: Type.Optional(
      Type.String({
        description:
          "For snapshot/open: only the lines containing this text (any case), with a little context.",
      }),
    ),
    links: Type.Optional(
      Type.Boolean({
        description: "For snapshot/open: also list each link's address.",
      }),
    ),
    labels: Type.Optional(
      Type.Boolean({
        description:
          "For screenshot: draw each visible control's ref on the picture, so you can click what you see.",
      }),
    ),
    accept: Type.Optional(
      Type.Boolean({
        description:
          "For dialog: true to accept (OK), false to dismiss (Cancel).",
      }),
    ),
  });
}

export interface BrowserParams {
  action: BrowserActionName;
  url?: string;
  ref?: string;
  text?: string;
  value?: string;
  key?: string;
  ms?: number;
  interactive?: boolean;
  query?: string;
  links?: boolean;
  labels?: boolean;
  accept?: boolean;
}
