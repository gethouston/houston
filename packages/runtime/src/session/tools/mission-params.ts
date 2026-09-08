import type { ProviderOption } from "@houston/domain";
import { type Static, type TOptional, type TString, Type } from "typebox";
import { agentSummaryList, reachableAgentSummaries } from "./mission-agents";
import {
  missionModelDescription,
  missionProviderParam,
} from "./mission-providers";
import type { SandboxFetch } from "./sandbox-fetch";
import type { SessionToolError } from "./tool-error";

/**
 * The mission tools' parameter schemas and the one rule that varies by session:
 * WHOSE board the call acts on.
 *
 * Every agent acts on its own board unless it names another. The personal
 * assistant MUST name one: it holds no board of its own, so a mission it
 * started for itself would land somewhere the user can never look at. The
 * schema keeps `agent` optional either way — a missing one is refused here,
 * with a sentence the model can act on, rather than as a validation error.
 */

const AGENT_DESCRIPTION =
  "Another agent's name, to put this on THEIR board instead of your own. Omit it for your own board.";

const ASSISTANT_AGENT_DESCRIPTION =
  "REQUIRED: the name of the agent whose board this belongs on. You have no board of your own, so always name one of the user's agents - list them first if you are not sure which exist.";

const agentParam = (personalAssistant: boolean) =>
  Type.Optional(
    Type.String({
      description: personalAssistant
        ? ASSISTANT_AGENT_DESCRIPTION
        : AGENT_DESCRIPTION,
    }),
  );

/** Everything a mission start takes except the provider choice. */
const missionFields = (
  personalAssistant: boolean,
  providers: readonly ProviderOption[],
) => ({
  agent: agentParam(personalAssistant),
  title: Type.String({
    description:
      "Short mission title in the user's language, as it should read on their board.",
  }),
  prompt: Type.String({
    description:
      "Complete standalone instructions for the new mission. It cannot see this conversation - include every fact, constraint, and piece of context it needs.",
  }),
  mode: Type.Optional(
    Type.Union(
      [Type.Literal("execute"), Type.Literal("plan"), Type.Literal("auto")],
      {
        description:
          "How the mission runs: 'execute' may ask the user questions (default), 'auto' never asks and finishes with what it has, 'plan' proposes a plan for the user to approve first.",
      },
    ),
  ),
  model: Type.Optional(
    Type.String({ description: missionModelDescription(providers) }),
  ),
});

const withProviderChoice = (
  fields: ReturnType<typeof missionFields>,
  provider: TOptional<TString>,
) => Type.Object({ ...fields, provider });

/**
 * The accepted provider ids ARE the ones connected right now, so the model
 * chooses from a list instead of inventing one; with nothing connected the
 * param is not offered at all (an empty union is not a schema) and the `model`
 * description says why. Frozen for the session with the rest of the tool defs —
 * `resolveMissionPin` and the host's start route are what catch a provider
 * connected or disconnected after this snapshot.
 */
export const startMissionParams = (
  personalAssistant: boolean,
  providers: readonly ProviderOption[],
) => {
  const fields = missionFields(personalAssistant, providers);
  const provider = missionProviderParam(providers, personalAssistant);
  // SAFETY: the declared shape always carries `provider` as an optional id, so
  // the tool's params are one stable type; a caller must handle its absence
  // regardless, because the model may simply omit it.
  return provider
    ? withProviderChoice(fields, provider)
    : (Type.Object(fields) as unknown as ReturnType<typeof withProviderChoice>);
};

export const listMissionsParams = (personalAssistant: boolean) =>
  Type.Object({ agent: agentParam(personalAssistant) });

export const updateMissionStatusParams = (personalAssistant: boolean) =>
  Type.Object({
    agent: agentParam(personalAssistant),
    id: Type.String({ description: "The mission id, from list_missions." }),
    status: Type.Union([Type.Literal("done"), Type.Literal("archived")], {
      description:
        "'done' marks a reviewed mission complete; 'archived' puts it away.",
    }),
  });

export const readMissionParams = (
  personalAssistant: boolean,
  defaultTail: number,
) =>
  Type.Object({
    agent: agentParam(personalAssistant),
    id: Type.String({ description: "The mission id, from list_missions." }),
    limit: Type.Optional(
      Type.Number({
        description: `How many recent messages to read (default ${defaultTail}, max 100).`,
      }),
    ),
  });

export type StartMissionParams = Static<ReturnType<typeof startMissionParams>>;
export type ListMissionsParams = Static<ReturnType<typeof listMissionsParams>>;
export type UpdateMissionStatusParams = Static<
  ReturnType<typeof updateMissionStatusParams>
>;
export type ReadMissionParams = Static<ReturnType<typeof readMissionParams>>;

/**
 * The named target, or the refusal the assistant gets for leaving it out.
 *
 * A VALUE, not a throw: the message is written to the model, it says what to do
 * next, and it NAMES the agents that would have worked. An identifier is never
 * to be guessed, and a refusal that withholds the list is what makes a model
 * guess one (mission-agents.ts fetches it; an unreadable list simply drops out
 * of the sentence).
 */
export type TargetAgent =
  | { ok: true; agent: string | undefined }
  | { ok: false; error: SessionToolError };

export async function resolveTargetAgent(
  agent: string | undefined,
  personalAssistant: boolean,
  call: SandboxFetch,
  signal?: AbortSignal,
): Promise<TargetAgent> {
  const named = agent?.trim();
  if (named) return { ok: true, agent: named };
  if (!personalAssistant) return { ok: true, agent: undefined };
  const directory = agentSummaryList(
    await reachableAgentSummaries(call, signal),
  );
  return {
    ok: false,
    error: {
      code: "agent_required",
      message: directory
        ? `Name the agent whose board this work belongs on: you have no board of your own, so work you start has to live on one of the user's agents. The user's agents are: ${directory}. Call this again with 'agent' set to the one this belongs to, or ask the user which.`
        : "Name the agent whose board this work belongs on: you have no board of your own, so work you start has to live on one of the user's agents. List the user's agents, pick the one this belongs to (or ask them to create one), then call this again with 'agent' set.",
    },
  };
}

/** `?agent=<name>` for the read routes, or "" when acting on the own board. */
export const agentQuery = (agent: string | undefined): string =>
  agent ? `?agent=${encodeURIComponent(agent)}` : "";
