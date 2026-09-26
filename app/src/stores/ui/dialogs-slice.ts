import type { CreateFlowDoor } from "../../components/shell/create-agent-steps-model.ts";
import type { TeamMoveSource } from "../../lib/move-team";
import type { UISliceCreator } from "./state.ts";
import type { CreateFlowRequest, FilePreviewTarget } from "./types.ts";

/** Sheets, dialogs and menus layered over the shell. All ephemeral. */
export interface DialogFields {
  /**
   * The ONE create sheet ("Add to your workspace"), or null while it is shut.
   * Store-owned rather than the rail's own state: the phone has no rail, and
   * every other entry point (the AI Employees list's New AI Employee and New
   * group) opens the same sheet through the same door.
   */
  createFlow: CreateFlowRequest | null;
  teamMoveSource: TeamMoveSource | null;
  /** "Your agent is still being created" write-blocked notice (HOU-693). */
  agentWarmingNoticeOpen: boolean;
  /** Whether the phone's compose agent-picker sheet is open (the mobile
   *  new-mission flow: pick an agent, push its empty draft chat). Ephemeral
   *  dialog flag, never persisted. */
  newMissionSheetOpen: boolean;
  /** The sheet's roster, as agent ids: a board's compose scopes it to the
   *  board's own agents; `null` = the full roster (the top bar's compose). */
  newMissionSheetAgentIds: string[] | null;
  /** Whether the phone's "More" menu is open (the floating card the nav bar
   *  raises: the workspace switcher, the long tail of destinations, help).
   *  Session-only, never persisted: a menu restored open after a reload is a
   *  trap on a phone. It is deliberately NOT a nav entry — a menu the back
   *  button could pop would be a place, which it is not. */
  mobileMoreOpen: boolean;
  /** Whether the global command palette (⌘K) is open. */
  paletteOpen: boolean;
  /** Whether the keyboard shortcut cheatsheet (?) is open. */
  cheatsheetOpen: boolean;
  /** Whether the "From a friend" import wizard is open. */
  importFromFriendOpen: boolean;
  /** File shown by the global preview dialog, or null when closed. */
  filePreview: FilePreviewTarget | null;
  /** Whether the C19 "choose the routines to keep" dialog is open. */
  planKeepDialogOpen: boolean;
}

export interface DialogActions {
  /** Open the create sheet on the given door. */
  openCreateFlow: (door: CreateFlowDoor) => void;
  closeCreateFlow: () => void;
  openTeamMove: (source: TeamMoveSource) => void;
  closeTeamMove: () => void;
  setAgentWarmingNoticeOpen: (open: boolean) => void;
  setNewMissionSheetOpen: (open: boolean, agentIds?: string[]) => void;
  setMobileMoreOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setCheatsheetOpen: (open: boolean) => void;
  setImportFromFriendOpen: (open: boolean) => void;
  setFilePreview: (preview: FilePreviewTarget | null) => void;
  setPlanKeepDialogOpen: (open: boolean) => void;
}

export const dialogInitialState = {
  createFlow: null,
  teamMoveSource: null,
  agentWarmingNoticeOpen: false,
  newMissionSheetOpen: false,
  newMissionSheetAgentIds: null,
  mobileMoreOpen: false,
  paletteOpen: false,
  cheatsheetOpen: false,
  importFromFriendOpen: false,
  filePreview: null,
  planKeepDialogOpen: false,
} satisfies DialogFields;

export const createDialogActions: UISliceCreator<DialogActions> = (set) => ({
  openCreateFlow: (door) => set({ createFlow: { door } }),
  closeCreateFlow: () => set({ createFlow: null }),
  openTeamMove: (teamMoveSource) => set({ teamMoveSource }),
  closeTeamMove: () => set({ teamMoveSource: null }),
  setAgentWarmingNoticeOpen: (agentWarmingNoticeOpen) =>
    set({ agentWarmingNoticeOpen }),
  setNewMissionSheetOpen: (newMissionSheetOpen, agentIds) =>
    set({
      newMissionSheetOpen,
      newMissionSheetAgentIds: newMissionSheetOpen ? (agentIds ?? null) : null,
    }),
  setMobileMoreOpen: (mobileMoreOpen) => set({ mobileMoreOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setCheatsheetOpen: (cheatsheetOpen) => set({ cheatsheetOpen }),
  setImportFromFriendOpen: (importFromFriendOpen) =>
    set({ importFromFriendOpen }),
  setFilePreview: (filePreview) => set({ filePreview }),
  setPlanKeepDialogOpen: (planKeepDialogOpen) => set({ planKeepDialogOpen }),
});
