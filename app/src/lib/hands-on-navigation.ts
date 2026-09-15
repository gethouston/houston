import type { HandsOnSurface } from "@houston/protocol";
import { ORGANIZATION_VIEW_ID } from "../components/organization/id.ts";
import { useOrgNav } from "../components/organization/org-nav-store.ts";
import { useUIStore } from "../stores/ui.ts";
import { DEFAULT_TEAM_ID } from "./teams-model.ts";

/**
 * Where each hands-on errand actually LIVES in the app.
 *
 * The protocol's surface vocabulary is closed precisely so this map can be
 * total: an errand the agent queues always has a real screen behind its button,
 * never a name the app has to guess at. Everything here is ordinary navigation
 * through the UI store, so the errand lands the person exactly where clicking
 * the rail themselves would.
 *
 * `files` and `routineWebhook` belong to a TEAM, so they follow the team the
 * person is already working in and fall back to the default team (the workspace
 * itself), which exists in every deployment.
 */
export function openHandsOnSurface(surface: HandsOnSurface): void {
  const ui = useUIStore.getState();
  if (surface === "apiKeys") {
    ui.openSettings("apiKeys");
    return;
  }
  // The Danger Zone is a block on the Settings INDEX, not a section of its own.
  if (surface === "orgDanger") {
    ui.openSettings(null);
    return;
  }
  if (surface === "billing") {
    // Admin owns its own tab state, so the tab is pinned before navigating.
    useOrgNav.getState().requestTab("billing");
    ui.setViewMode(ORGANIZATION_VIEW_ID);
    return;
  }
  ui.openTeamView(
    ui.activeTeamId ?? DEFAULT_TEAM_ID,
    surface === "files" ? "files" : "routines",
  );
}

/** The chat-namespace key naming each screen in the person's own words. */
const SCREEN_KEYS = {
  apiKeys: "interaction.handsOnScreens.apiKeys",
  billing: "interaction.handsOnScreens.billing",
  files: "interaction.handsOnScreens.files",
  routineWebhook: "interaction.handsOnScreens.routineWebhook",
  orgDanger: "interaction.handsOnScreens.orgDanger",
} as const satisfies Record<HandsOnSurface, string>;

export function handsOnScreenKey(
  surface: HandsOnSurface,
): (typeof SCREEN_KEYS)[HandsOnSurface] {
  return SCREEN_KEYS[surface];
}
