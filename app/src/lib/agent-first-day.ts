/**
 * Starting an AI Employee's first day from the app: the setup task where it
 * introduces itself and interviews the user about how it should work,
 * persisting what the user says through its normal abilities (instructions,
 * Skills, Routines). "The agent creates itself."
 *
 * The host does the starting (`agents.startFirstDay`): it creates the task,
 * fires its hidden first turn on the brain the employee was hired with, and
 * records the start, once, however many buttons or tabs ask. This module only
 * opens what it started.
 *
 * The first thing the user reads is not a model turn: the chat renders a
 * hello as the task's first item from the name and job recorded here
 * (`lib/setup-mission-greeting.ts`), so it is whole before a cold engine has
 * warmed up. The hidden prompt tells the model that message was already read.
 */

import type { FirstDayStartResult } from "@houston/engine-adapter";
import type { Config } from "../data/config";
import { registerSetupGreeting } from "../hooks/use-setup-greeting";
import { useUIStore } from "../stores/ui";
import { analytics } from "./analytics";
import { publishCreatedMission } from "./created-mission-handoff";
import i18n from "./i18n";
import { queryClient } from "./query-client";
import { queryKeys } from "./query-keys";
import { tauriAgents } from "./tauri";

// The pure half lives apart so it loads without the engine client.
export { isFirstDayPending } from "./agent-first-day-model";

export interface FirstDayAgent {
  id: string;
  name: string;
  folderPath: string;
}

/**
 * Start the employee's first day and open its chat beside the board. Resolves
 * whether the setup task is open; a failure is already surfaced by the engine
 * call, and the config refetch then shows whatever the host holds.
 */
export async function startEmployeeFirstDay(
  agent: FirstDayAgent,
): Promise<boolean> {
  const configKey = queryKeys.config(agent.folderPath);
  let result: FirstDayStartResult;
  try {
    result = await tauriAgents.startFirstDay(agent.folderPath, {
      locale: i18n.language,
      title: i18n.t("agentOnboarding:setupMission.title"),
    });
  } catch {
    // `call()` in lib/tauri.ts already reported it and chose the toast (a
    // waking pod, offline). A refusal means this button was stale: the
    // refetch takes it away.
    void queryClient.invalidateQueries({ queryKey: configKey });
    return false;
  }
  if (result.outcome === "started") {
    analytics.track(
      "agent_onboarding_started",
      result.arrival ? { source: result.arrival } : undefined,
    );
    // The hello's two facts, recorded while they are in hand: reading them
    // back off a hosted employee still being provisioned answers nothing.
    registerSetupGreeting({
      agentPath: agent.folderPath,
      sessionKey: result.mission.sessionKey,
      agentName: agent.name,
      role: result.role,
    });
  }
  // What the host just recorded, so every start button goes on this frame.
  queryClient.setQueryData<Config>(configKey, (prev) => ({
    ...(prev ?? {}),
    firstDay: "started",
  }));
  // Name the task for the board BEFORE its panel opens: the sweep has not
  // returned this row yet, and without it the panel opens on no session.
  publishCreatedMission({
    activityId: result.mission.id,
    agentPath: agent.folderPath,
    sessionKey: result.mission.sessionKey,
  });
  useUIStore
    .getState()
    .setActivityPanelId(result.mission.id, { forceOpen: true });
  return true;
}
