import type { LinkedInConnectWatch } from "@houston/sdk/linkedin/policy";
import type { ShareLine } from "./org-chart-share-run.ts";
import type { PostedPost } from "./org-chart-share-step.ts";

export interface ConnectAttempt {
  id: number;
  minting: boolean;
  watch: LinkedInConnectWatch;
}

export interface ShareDialogState {
  open: boolean;
  session: number;
  line: ShareLine | null;
  copied: boolean;
  text: string | null;
  connect: ConnectAttempt | null;
  posted: PostedPost | null;
}

type AttemptTag = { session: number; attempt: number };

export type ShareDialogAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "redrawn"; url: string | null }
  | { type: "landed"; session: number; line: ShareLine | null }
  | { type: "copied" }
  | { type: "copiedDone" }
  | { type: "edited"; text: string }
  | ({ type: "connecting"; watch: LinkedInConnectWatch } & AttemptTag)
  | ({ type: "connectOpened" } & AttemptTag)
  | ({ type: "connectEnded"; line?: ShareLine } & AttemptTag)
  | { type: "posting" }
  | { type: "posted"; postUrl: string }
  | { type: "postOpened"; session: number; postUrl: string }
  | { type: "postUnconfirmed" }
  | { type: "unconfirmedDismissed" }
  | { type: "postRefused"; line: ShareLine | null };

export const INITIAL_SHARE_DIALOG: ShareDialogState = {
  open: false,
  session: 0,
  line: null,
  copied: false,
  text: null,
  connect: null,
  posted: null,
};

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
    case "posted": {
      const opened =
        state.posted?.postUrl === action.postUrl && state.posted.opened;
      return state.open ? withPosted(state, action.postUrl, opened) : state;
    }
    case "postOpened":
      return here ? withPosted(state, action.postUrl, true) : state;
    case "postUnconfirmed":
      return state.open ? { ...state, line: { kind: "unconfirmed" } } : state;
    case "unconfirmedDismissed":
      return saysUnconfirmed(state) ? { ...state, line: null } : state;
    case "postRefused":
      return state.open ? { ...state, line: action.line } : state;
  }
}

function withPosted(
  state: ShareDialogState,
  postUrl: string,
  opened: boolean,
): ShareDialogState {
  return {
    ...state,
    posted: { postUrl, opened },
    line: { kind: "posted", opened },
  };
}

function saysUnconfirmed(state: ShareDialogState): boolean {
  return state.line?.kind === "unconfirmed";
}

export function replacesShownImage(
  previous: string | null,
  next: string | null,
): boolean {
  return previous !== null && previous !== next;
}
