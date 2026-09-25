import {
  AGENT_SETUP_AGENT_MODE,
  buildFirstDayPrompt,
  createActivity,
  type FirstDayBrief,
  missionConversationKey,
} from "@houston/domain";
import {
  type Activity,
  type AgentConfig,
  encodeAutoContinue,
  type FirstDayStartInput,
} from "@houston/protocol";
import type { FirstDayStartDeps } from "./agent-first-day-start";

/** The setup task a first-day start makes, and its hidden first turn. */

/** The English title a start with no surface-supplied one gives the task. */
const DEFAULT_TITLE = "Getting set up";

export function newSetupTask(
  deps: FirstDayStartDeps,
  input: FirstDayStartInput,
  config: AgentConfig,
): Activity {
  return createActivity(
    {
      title: input.title?.trim() || DEFAULT_TITLE,
      // The user typed nothing: no description, so nothing of the hidden
      // prompt can surface as the board card's body.
      description: "",
      agent: AGENT_SETUP_AGENT_MODE,
      ...(config.provider ? { provider: config.provider } : {}),
      ...(config.model ? { model: config.model } : {}),
    },
    crypto.randomUUID(),
    new Date().toISOString(),
    deps.author,
  );
}

/** Fire the setup task's first turn: the hidden hello prompt, on the hire's pin. */
export function fireFirstTurn(
  deps: FirstDayStartDeps,
  task: Activity,
  config: AgentConfig,
  brief: FirstDayBrief | undefined,
  input: FirstDayStartInput,
): Promise<void> {
  const prompt = buildFirstDayPrompt(
    deps.agent.name,
    input.locale ?? "en",
    brief,
  );
  return deps.channel.fireTurn(
    { workspace: deps.workspace, agent: deps.agent },
    missionConversationKey(task),
    // The user never wrote this message: the marker folds it out of the
    // transcript on the live and the reload path alike.
    encodeAutoContinue(prompt),
    {
      ...(config.provider ? { provider: config.provider } : {}),
      ...(config.model ? { model: config.model } : {}),
      // One question card needs no deliberation, and every second of
      // thinking is the user staring at the hello waiting for more.
      effort: "low",
    },
    deps.actingAs ? undefined : deps.actingUser,
    deps.actingAs,
  );
}
