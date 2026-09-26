import {
  type PanelOwner,
  setPanelOwner,
} from "../../components/shell/detail-panel-owners.ts";
import { navigated } from "../../lib/nav-stack.ts";
import { noChat } from "./nav-slice.ts";
import type { UISliceCreator } from "./state.ts";

/** The shell detail panel, the activity panel, and the callbacks the
 *  on-screen board registers for the keyboard. */
export interface PanelFields {
  activityPanelId: string | null;
  activityPanelForceOpen: boolean;
  /** Callback registered by whichever employee's board is on the glass to
   *  open its new-mission flow. */
  onStartMission: (() => void) | null;
  /**
   * A one-shot ask, from outside any board, to open this agent's New task
   * composer: the board on the glass that holds the agent takes it and clears
   * it (`board/use-mc-new-mission.tsx`). An agent id, or null.
   */
  newTaskRequest: string | null;
  /**
   * Whether the ONE shell-level detail panel is open (the shell renders it
   * full-height beside `<main>`). DERIVED from `missionPanelOwners` — never
   * set directly.
   */
  missionPanelOpen: boolean;
  /**
   * Ids of the surfaces currently claiming the shell detail panel. Several
   * surfaces render the panel (the mission boards, the Routines chat, the
   * Archived lists, the skill / integration setup chats) and all of them stay
   * MOUNTED while hidden, so a single last-writer-wins boolean strands the
   * panel open as an empty card: the screen that leaves keeps its `true` on the
   * flag while it stops portaling anything into it (PRODUCT-1229). Each
   * surface claims and releases its OWN id via `useShellDetailPanel`, so
   * releasing can never clobber the surface the user just navigated to.
   * Each claim also records whether its surface allows the wide layout.
   */
  missionPanelOwners: PanelOwner[];
  /** Arrow-key kanban navigator registered by whichever employee's board
   *  is on screen. Moves the keyboard highlight; does NOT open the chat
   *  panel. */
  onBoardNavigate: ((dir: "up" | "down" | "left" | "right") => void) | null;
  /** Open the currently-highlighted card's chat panel. Registered by
   *  the same board owner as `onBoardNavigate`. Fired by Enter. */
  onBoardOpen: (() => void) | null;
  /** Close the chat detail panel. Registered by the board owner while
   *  a card is selected; fired by Escape when the composer is not
   *  focused (the first Escape blurs the composer, the second closes). */
  onPanelClose: (() => void) | null;
}

export interface PanelActions {
  setActivityPanelId: (
    id: string | null,
    options?: { forceOpen?: boolean },
  ) => void;
  setOnStartMission: (cb: (() => void) | null) => void;
  requestNewTask: (agentId: string | null) => void;
  /** Claim (`open`) or release the shell detail panel for one surface;
   *  `wide` says whether that surface allows the wide chat layout. */
  setMissionPanelOwner: (
    ownerId: string,
    open: boolean,
    wide?: boolean,
  ) => void;
  /** Release every claim — the "get me out of this panel" escape hatch. */
  closeMissionPanel: () => void;
  setOnBoardNavigate: (
    cb: ((dir: "up" | "down" | "left" | "right") => void) | null,
  ) => void;
  setOnBoardOpen: (cb: (() => void) | null) => void;
  setOnPanelClose: (cb: (() => void) | null) => void;
}

export const panelInitialState = {
  activityPanelId: null,
  activityPanelForceOpen: false,
  onStartMission: null,
  newTaskRequest: null,
  missionPanelOpen: false,
  missionPanelOwners: [],
  onBoardNavigate: null,
  onBoardOpen: null,
  onPanelClose: null,
} satisfies PanelFields;

export const createPanelActions: UISliceCreator<PanelActions> = (set) => ({
  setActivityPanelId: (activityPanelId, options) =>
    set({
      activityPanelId,
      activityPanelForceOpen: activityPanelId
        ? (options?.forceOpen ?? false)
        : false,
    }),
  setOnStartMission: (onStartMission) => set({ onStartMission }),
  requestNewTask: (newTaskRequest) => set({ newTaskRequest }),
  setMissionPanelOwner: (ownerId, open, wide = false) =>
    set((s) => {
      const missionPanelOwners = setPanelOwner(
        s.missionPanelOwners,
        ownerId,
        open,
        wide,
      );
      if (missionPanelOwners === s.missionPanelOwners) return s;
      const missionPanelOpen = missionPanelOwners.length > 0;
      const partial = { missionPanelOwners, missionPanelOpen };
      // Only the panel's open/shut TRANSITIONS are navigation (a second
      // claim on an open panel is not a move): opening pushes a level the
      // back button can pop, the last release retreats it. Opening also
      // closes any pushed chat — the two chat surfaces must never
      // coexist, and a resize dance could otherwise stack them.
      if (missionPanelOpen === s.missionPanelOpen) return partial;
      return navigated(
        s,
        missionPanelOpen ? { ...partial, ...noChat } : partial,
        missionPanelOpen ? "push" : "retreat",
      );
    }),
  closeMissionPanel: () =>
    set((s) => {
      const partial = { missionPanelOwners: [], missionPanelOpen: false };
      // Same retreat as the last owner's release: closing the panel is a
      // "back" when the previous entry is this view without it.
      return s.missionPanelOpen ? navigated(s, partial, "retreat") : partial;
    }),
  setOnBoardNavigate: (onBoardNavigate) => set({ onBoardNavigate }),
  setOnBoardOpen: (onBoardOpen) => set({ onBoardOpen }),
  setOnPanelClose: (onPanelClose) => set({ onPanelClose }),
});
