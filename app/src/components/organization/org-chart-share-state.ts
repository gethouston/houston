import type { LinkedInConnectWatch } from "@houston/sdk/linkedin/policy";
import type { ShareLine } from "./org-chart-share-run.ts";

/**
 * The share dialog's state. Pure and DOM-free. Each opening is a new
 * `session`: a share or a connect started in one session never writes into a
 * later one (closed and reopened while LinkedIn was opening), and a new
 * session starts with no line, the post's own words, no connect under way and
 * Copy image unflipped. A redrawn image drops the line and the flip: what was
 * said about the old picture no longer holds.
 *
 * A post is the exception: it is public and the gateway may take a minute,
 * so it outlives the opening, and the page, that started it. Whether one is
 * out lives in `linkedin-post-store.ts`; its result lands in whichever
 * opening is on screen, one that went up while none was is said in the next
 * one, and one that may be up is said in every opening until the person
 * checked LinkedIn.
 */

/** One Connect LinkedIn click, tagged so a stale one's results are dropped. */
export interface ConnectAttempt {
  id: number;
  /** Asking the gateway for LinkedIn's page; nothing is open yet. */
  minting: boolean;
  /** The connection is polled until it lands or this runs out. */
  watch: LinkedInConnectWatch;
}

export interface ShareDialogState {
  open: boolean;
  session: number;
  line: ShareLine | null;
  copied: boolean;
  /** The post as the person edited it; `null` keeps the authored words. */
  text: string | null;
  /** The LinkedIn connect under way in this opening. */
  connect: ConnectAttempt | null;
  /** LinkedIn's page for the post just made. */
  postUrl: string | null;
}

/** Names the opening and the connect attempt a result belongs to. */
type AttemptTag = { session: number; attempt: number };

export type ShareDialogAction =
  | { type: "open" }
  | { type: "close" }
  /** The picture on screen was replaced (`null` while the new one draws). */
  | { type: "redrawn"; url: string | null }
  | { type: "landed"; session: number; line: ShareLine | null }
  | { type: "copied" }
  | { type: "copiedDone" }
  | { type: "edited"; text: string }
  | ({ type: "connecting"; watch: LinkedInConnectWatch } & AttemptTag)
  /** LinkedIn's page is open: the attempt now waits on the connection. */
  | ({ type: "connectOpened" } & AttemptTag)
  /** The attempt is over: landed, given up on, or never opened. */
  | ({ type: "connectEnded"; line?: ShareLine } & AttemptTag)
  | { type: "posting" }
  | { type: "posted"; postUrl: string }
  /** No answer came in time: the post may be up. */
  | { type: "postUnconfirmed" }
  /** The person checked LinkedIn and dismissed the unconfirmed line. */
  | { type: "unconfirmedDismissed" }
  | { type: "postRefused"; line: ShareLine | null };

export const INITIAL_SHARE_DIALOG: ShareDialogState = {
  open: false,
  session: 0,
  line: null,
  copied: false,
  text: null,
  connect: null,
  postUrl: null,
};

/** Whether `tag` names the attempt on screen now. */
function current(state: ShareDialogState, tag: AttemptTag): boolean {
  return tag.session === state.session && state.connect?.id === tag.attempt;
}

export function shareDialogReducer(
  state: ShareDialogState,
  action: ShareDialogAction,
): ShareDialogState {
  const here =
    "session" in action && action.session === state.session && state.open;
  switch (action.type) {
    case "open":
      return {
        ...INITIAL_SHARE_DIALOG,
        open: true,
        session: state.session + 1,
      };
    case "close":
      return { ...state, open: false, connect: null };
    case "redrawn":
      // A new picture changes nothing about a post that may be up.
      return {
        ...state,
        line: saysUnconfirmed(state) ? state.line : null,
        copied: false,
      };
    case "landed":
      return here ? { ...state, line: action.line } : state;
    case "copied":
      return { ...state, copied: true };
    case "copiedDone":
      return { ...state, copied: false };
    case "edited":
      return { ...state, text: action.text };
    case "connecting":
      return here
        ? {
            ...state,
            connect: { id: action.attempt, minting: true, watch: action.watch },
            line: null,
          }
        : state;
    case "connectOpened":
      return current(state, action) && state.connect
        ? { ...state, connect: { ...state.connect, minting: false } }
        : state;
    case "connectEnded":
      return current(state, action)
        ? { ...state, connect: null, line: action.line ?? state.line }
        : state;
    case "posting":
      return { ...state, line: null };
    case "posted":
      return state.open
        ? { ...state, postUrl: action.postUrl, line: { kind: "posted" } }
        : state;
    case "postUnconfirmed":
      return state.open ? { ...state, line: { kind: "unconfirmed" } } : state;
    case "unconfirmedDismissed":
      return saysUnconfirmed(state) ? { ...state, line: null } : state;
    case "postRefused":
      return state.open ? { ...state, line: action.line } : state;
  }
}

/**
 * Whether the line says a post may be up. Whether Post waits is the post
 * slot's to say (`isPostHeld`), held in every opening until the person
 * checked.
 */
function saysUnconfirmed(state: ShareDialogState): boolean {
  return state.line?.kind === "unconfirmed";
}

/**
 * Whether the picture on screen was replaced. The first image arriving is
 * not: a share started while it drew keeps its line.
 */
export function replacesShownImage(
  previous: string | null,
  next: string | null,
): boolean {
  return previous !== null && previous !== next;
}
