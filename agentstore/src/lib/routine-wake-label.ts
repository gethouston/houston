/**
 * "What wakes this routine", written for someone deciding whether to install the
 * agent. Never a cron expression and never a toolkit slug: a listing is a
 * shop window, not a config screen.
 *
 * A humanized cron line would be better than "On a schedule", but the only
 * humanizer in the repo (`@houston-ai/routines` `cronSummary`) belongs to the
 * app's schedule editor, which this site does not depend on. Adding that
 * dependency for one line is not worth the coupling; if the store ever needs
 * real schedule copy, move the humanizer down into a shared package first.
 */
import type { AgentRoutine } from "@houston/agentstore-contract";
import { resolveIntegrationLabels } from "@houston-ai/store";

export function routineWakeLabel(routine: AgentRoutine): string {
  const wake = routine.wake;
  if (wake.kind === "schedule") return "On a schedule";
  if (wake.kind === "webhook") return "When an external app calls it";
  const [resolved] = resolveIntegrationLabels([wake.toolkit.toUpperCase()]);
  return `When ${resolved?.label ?? wake.toolkit} has a new event`;
}
