import {
  type PanelOwner,
  setPanelOwner,
} from "../../components/shell/detail-panel-owners.ts";
import { navigated } from "../../lib/nav-stack.ts";
import { noChat, noPreview } from "./nav-slice.ts";
import type { UISliceCreator } from "./state.ts";

export interface PanelFields {
  activityPanelId: string | null;
  activityPanelForceOpen: boolean;
  onStartMission: (() => void) | null;
  newTaskRequest: string | null;
  missionPanelOpen: boolean;
  missionPanelOwners: PanelOwner[];
  onBoardNavigate: ((dir: "up" | "down" | "left" | "right") => void) | null;
  onBoardOpen: (() => void) | null;
  onPanelClose: (() => void) | null;
}

export interface PanelActions {
  setActivityPanelId: (
    id: string | null,
    options?: { forceOpen?: boolean },
  ) => void;
  setOnStartMission: (cb: (() => void) | null) => void;
  requestNewTask: (agentId: string | null) => void;
  setMissionPanelOwner: (
    ownerId: string,
    open: boolean,
    wide?: boolean,
  ) => void;
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
      if (missionPanelOpen === s.missionPanelOpen) return partial;
      return navigated(
        s,
        missionPanelOpen
          ? { ...partial, ...noChat }
          : { ...partial, ...noPreview },
        missionPanelOpen ? "push" : "retreat",
      );
    }),
  closeMissionPanel: () =>
    set((s) => {
      const partial = { missionPanelOwners: [], missionPanelOpen: false };
      return s.missionPanelOpen
        ? navigated(s, { ...partial, ...noPreview }, "retreat")
        : partial;
    }),
  setOnBoardNavigate: (onBoardNavigate) => set({ onBoardNavigate }),
  setOnBoardOpen: (onBoardOpen) => set({ onBoardOpen }),
  setOnPanelClose: (onPanelClose) => set({ onPanelClose }),
});
