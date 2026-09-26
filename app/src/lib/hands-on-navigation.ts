import type { HandsOnSurface } from "@houston/protocol";
import { useUIStore } from "../stores/ui.ts";
import { openHome } from "./home-nav.ts";
import { openAdmin } from "./open-admin.ts";
import { currentWorkingAgentId, openAgentSection } from "./open-agent.ts";

/**
 * Where each hands-on errand actually LIVES in the app.
 *
 * The protocol's surface vocabulary is closed precisely so this map can be
 * total: an errand the agent queues always has a real screen behind its button,
 * never a name the app has to guess at. Everything here is ordinary navigation
 * through the UI store, so the errand lands the person exactly where clicking
 * the rail themselves would.
 *
 * Files and routine webhooks open for the current employee, or the first
 * employee in sidebar order when none is selected.
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
    openAdmin({ section: "billing" });
    return;
  }
  const agentId = currentWorkingAgentId();
  if (!agentId) {
    openHome();
    return;
  }
  openAgentSection(agentId, surface === "files" ? "files" : "routines");
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
