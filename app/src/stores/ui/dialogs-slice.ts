import type { CreateFlowDoor } from "../../components/shell/create-agent-steps-model.ts";
import type { TeamMoveSource } from "../../lib/move-team";
import { navigated } from "../../lib/nav-stack.ts";
import type { UISliceCreator } from "./state.ts";
import type { CreateFlowRequest, FilePreviewTarget } from "./types.ts";

export interface DialogFields {
  createFlow: CreateFlowRequest | null;
  teamMoveSource: TeamMoveSource | null;
  agentWarmingNoticeOpen: boolean;
  newMissionSheetOpen: boolean;
  newMissionSheetAgentIds: string[] | null;
  mobileMoreOpen: boolean;
  paletteOpen: boolean;
  cheatsheetOpen: boolean;
  importFromFriendOpen: boolean;
  filePreview: FilePreviewTarget | null;
  planKeepDialogOpen: boolean;
}

export interface DialogActions {
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
  setFilePreview: (filePreview) =>
    set((s) => ({
      ...navigated(
        s,
        { filePreview },
        filePreview ? (s.filePreview ? "replace" : "push") : "retreat",
      ),
      ...(s.filePreview ? {} : { previewExpanded: false }),
    })),
  setPlanKeepDialogOpen: (planKeepDialogOpen) => set({ planKeepDialogOpen }),
});
