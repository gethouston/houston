import type { HandsOnSurface } from "@houston/protocol";
import { useUIStore } from "../stores/ui.ts";
import { openHome } from "./home-nav.ts";
import { openAdmin } from "./open-admin.ts";
import {
  currentWorkingAgentId,
  openAgentApiAccess,
  openAgentSection,
} from "./open-agent.ts";

export function openHandsOnSurface(
  surface: HandsOnSurface,
  stepAgentId?: string,
): void {
  const ui = useUIStore.getState();
  if (surface === "agentApiAccess") {
    if (stepAgentId) openAgentApiAccess(stepAgentId);
    else openHome();
    return;
  }
  if (surface === "apiKeys") {
    ui.openSettings("apiKeys");
    return;
  }
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
