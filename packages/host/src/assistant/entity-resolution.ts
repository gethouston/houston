import {
  agentDirectory,
  matchAgentRefs,
  qualifiedAgentName,
  type ReachableAgent,
} from "../routes/reachable-agents";
import type { AssistantOperation } from "./catalog";

/**
 * Identifiers are never guessed.
 *
 * A catalogued operation takes an agent as a plain string, under four spellings
 * of the same value (`id`, `agentId`, `agentPath`, `agentSlugOrId`), and the
 * schema says only "string". Left there, a model asked to rename "Marketing"
 * sends the word "Marketing" into a route that wants an id, gets a 404 with
 * nothing in it to correct from, and tries another invention. This module is
 * the fix: every agent-naming parameter is resolved against the agents that
 * ACTUALLY exist for this caller before the request is built, and a reference
 * that resolves to nothing comes back with the ones that would have.
 *
 * WHICH parameters those are is derived from the operation's own route — a
 * placeholder sitting in the segment after `agents` names an agent, whatever it
 * is called — never from a hand-kept list that a new operation would silently
 * fall out of.
 *
 * Pure: the reachable agents arrive from the caller, so the local host reads
 * them from its store and a gateway-fronted host from whatever it can see, and
 * the resolution ladder stays one thing.
 */

export type EntityResolutionCode =
  | "invalid_params"
  | "unknown_agent"
  | "ambiguous_agent";

export type EntityResolution =
  | { ok: true; params: Record<string, unknown> }
  | { ok: false; code: EntityResolutionCode; message: string };

export interface EntityResolutionDeps {
  /** Every agent this caller may address, its own workspace first. */
  agents(): Promise<readonly ReachableAgent[]>;
}

/**
 * The parameter names a body/query field is allowed to carry an agent under.
 * The path is the primary evidence; these cover the fields no path describes.
 */
const AGENT_FIELD_NAMES: ReadonlySet<string> = new Set([
  "agentId",
  "agentPath",
  "agentSlugOrId",
]);

/** The collection segment whose next segment addresses one agent. */
const AGENTS_SEGMENT = "agents";

/** The parameter reference a body field reads, without its field path. */
const rootOf = (reference: string): string =>
  reference.split(".")[0] ?? reference;

/**
 * Every parameter of `op` that names an agent, derived from the operation
 * itself: the path placeholders that fill an `/agents/{…}` segment, plus the
 * body and query fields spelled with one of the agent field names.
 */
export function agentIdentifierParams(op: AssistantOperation): string[] {
  const found = new Set<string>();
  const route = op.route;
  if (route) {
    const segments = route.path.split("/").filter(Boolean);
    segments.forEach((segment, at) => {
      if (at === 0 || segments[at - 1] !== AGENTS_SEGMENT) return;
      const name = /^\{(.+)\}$/.exec(segment)?.[1];
      if (name) found.add(name);
    });
    for (const [key, reference] of Object.entries(route.bodyFields ?? {})) {
      if (AGENT_FIELD_NAMES.has(key)) found.add(rootOf(reference));
    }
    for (const [key, reference] of Object.entries(route.query)) {
      if (AGENT_FIELD_NAMES.has(key)) found.add(rootOf(reference));
    }
  }
  for (const param of op.params) {
    if (AGENT_FIELD_NAMES.has(param.name)) found.add(param.name);
  }
  // Only parameters the operation actually declares: a placeholder the route
  // fills from something else is not something a caller can send.
  const declared = new Set(op.params.map((param) => param.name));
  return [...found].filter((name) => declared.has(name));
}

const refuse = (
  code: EntityResolutionCode,
  message: string,
): EntityResolution => ({ ok: false, code, message });

/**
 * Resolve every agent-naming parameter of `op` to the agent's id.
 *
 * Accepts the id, the exact name, and `<Workspace>/<Agent>`. A bare name two
 * workspaces both use is refused with the qualified spellings rather than
 * resolved to whichever came first; a reference nothing matches is refused with
 * the whole directory, because a rejection that does not say what WOULD have
 * worked is what sends a model guessing again.
 *
 * Params are returned as a new object; the caller's is never mutated.
 */
export async function resolveEntityParams(
  op: AssistantOperation,
  params: Record<string, unknown>,
  deps: EntityResolutionDeps,
): Promise<EntityResolution> {
  const names = agentIdentifierParams(op).filter((name) =>
    Object.hasOwn(params, name),
  );
  if (names.length === 0) return { ok: true, params };

  const resolved = { ...params };
  let reachable: readonly ReachableAgent[] | null = null;
  for (const name of names) {
    const raw = resolved[name];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "string" || !raw.trim()) {
      return refuse(
        "invalid_params",
        `"${name}" must name one of the user's agents. Call listAgents and pass the id it gives.`,
      );
    }
    reachable ??= await deps.agents();
    const matches = matchAgentRefs(reachable, raw);
    const only = matches.length === 1 ? matches[0] : undefined;
    if (matches.length === 0) return unknownAgent(name, raw, reachable);
    if (!only) return ambiguousAgent(name, raw, matches);
    resolved[name] = only.agent.id;
  }
  return { ok: true, params: resolved };
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
