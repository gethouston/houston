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

const DEFAULT_TITLE = "Getting set up";

export function newSetupTask(
  deps: Pick<FirstDayStartDeps, "author">,
  input: FirstDayStartInput,
  config: AgentConfig,
): Activity {
  return createActivity(
    {
      title: input.title?.trim() || DEFAULT_TITLE,
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

// WHY: Refusals are 409: the transport retries 5xx on this write and would fire the turn again. ADR-0016
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
    encodeAutoContinue(prompt),
    {
      ...(config.provider ? { provider: config.provider } : {}),
      ...(config.model ? { model: config.model } : {}),
      effort: "low",
    },
    {
      ...(deps.actingAs
        ? { actingAs: deps.actingAs }
        : { actingUser: deps.actingUser }),
      limits: deps.limits,
    },
  );
}
