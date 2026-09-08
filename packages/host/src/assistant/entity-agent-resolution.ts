import {
  agentDirectory,
  matchAgentRefs,
  qualifiedAgentName,
  type ReachableAgent,
} from "../routes/reachable-agents";
import type {
  EntityResolution,
  EntityResolutionCode,
} from "./entity-resolution";

const refuse = (
  code: EntityResolutionCode,
  message: string,
): EntityResolution => ({ ok: false, code, message });

export function resolveAgentReference(
  name: string,
  raw: string,
  reachable: readonly ReachableAgent[],
): EntityResolution {
  const matches = matchAgentRefs(reachable, raw);
  const only = matches.length === 1 ? matches[0] : undefined;
  if (matches.length === 0) return unknownAgent(name, raw, reachable);
  if (!only) return ambiguousAgent(name, raw, matches);
  return { ok: true, params: { [name]: only.agent.id } };
}

function unknownAgent(
  name: string,
  raw: string,
  reachable: readonly ReachableAgent[],
): EntityResolution {
  const directory = agentDirectory(reachable);
  return refuse(
    "unknown_agent",
    directory
      ? `There is no agent called ${JSON.stringify(raw)}, so "${name}" cannot be resolved. The agents here are: ${directory}. Pass one of those ids.`
      : `There is no agent called ${JSON.stringify(raw)}, and this user has no agents yet, so "${name}" cannot be resolved. Offer to create one.`,
  );
}

function ambiguousAgent(
  name: string,
  raw: string,
  matches: readonly ReachableAgent[],
): EntityResolution {
  const candidates = matches
    .map((entry) => `${qualifiedAgentName(entry)} (id ${entry.agent.id})`)
    .join(", ");
  return refuse(
    "ambiguous_agent",
    `${JSON.stringify(raw)} names more than one agent, so "${name}" is ambiguous: ${candidates}. Pass the id of the one the user meant, or ask them which.`,
  );
}
