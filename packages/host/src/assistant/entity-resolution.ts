import type { AssistantEntityCollection } from "@houston/domain/assistant-catalog-types";
import type { AssistantOperation } from "./catalog";
import { resolveAgentReference } from "./entity-agent-resolution";
import type { EntityDirectory } from "./entity-directory";
import { directoryEntries } from "./entity-resolution-directory";
import { valueProblem } from "./entity-values";

export type EntityResolutionCode =
  | "invalid_params"
  | "unknown_agent"
  | "ambiguous_agent"
  | "unknown_entity"
  | "ambiguous_entity";

export type EntityResolution =
  | { ok: true; params: Record<string, unknown> }
  | { ok: false; code: EntityResolutionCode; message: string };

export type EntityResolutionDeps = EntityDirectory;

/** The scope a child collection is listed under, once that parent resolved. */
const PARENT: Partial<
  Record<AssistantEntityCollection, AssistantEntityCollection>
> = {
  routines: "agents",
  skills: "agents",
  activities: "agents",
  "shared-skills": "workspaces",
};

/** Resolve parent scopes before children regardless of declaration order. */
function identifiers(op: AssistantOperation) {
  return op.params
    .flatMap((param) =>
      param.resolver ? [{ name: param.name, collection: param.resolver }] : [],
    )
    .sort(
      (a, b) => (PARENT[a.collection] ? 1 : 0) - (PARENT[b.collection] ? 1 : 0),
    );
}

/**
 * Turn every identifier the model passed into the real one, or refuse with the
 * values that exist.
 *
 * Which parameters name a thing is the catalog's own answer (`resolver`, put
 * there by the generator from the route the value is spliced into), so a new
 * operation on a known collection is checked the day it is annotated. Directory
 * failures propagate to the host reporting path: an unavailable list must never
 * become an empty list, and an empty list must never authorize an unchecked
 * identifier.
 */
export async function resolveEntityParams(
  op: AssistantOperation,
  params: Record<string, unknown>,
  deps: EntityResolutionDeps,
): Promise<EntityResolution> {
  const resolved = { ...params };
  const refs = identifiers(op);
  for (const { name, collection } of refs) {
    if (!Object.hasOwn(params, name) || params[name] === undefined) continue;
    const raw = resolved[name];
    if (typeof raw !== "string" || !raw.trim()) {
      return {
        ok: false,
        code: "invalid_params",
        message: `"${name}" must be a non-empty ${collection} id or exact name.`,
      };
    }
    if (collection === "agents") {
      const result = resolveAgentReference(name, raw, await deps.agents());
      if (!result.ok) return result;
      resolved[name] = result.params[name];
      continue;
    }
    const parent = PARENT[collection];
    const scope = parent
      ? resolved[refs.find((ref) => ref.collection === parent)?.name ?? ""]
      : "";
    if (parent && (typeof scope !== "string" || !scope)) {
      return {
        ok: false,
        code: "invalid_params",
        message: `"${name}" requires a resolved ${parent} scope.`,
      };
    }
    const result = matchEntity({
      name,
      raw,
      collection,
      entries: await directoryEntries(
        collection,
        deps,
        typeof scope === "string" ? scope : "",
      ),
    });
    if (!result.ok) return result;
    resolved[name] = result.params[name];
  }
  const problem = valueProblem(op, resolved);
  return problem
    ? { ok: false, code: "invalid_params", message: problem }
    : { ok: true, params: resolved };
}

interface Entry {
  id: string;
  name: string;
  email?: string;
}

/**
 * One value against one live list: its id, or its exact name (an address for a
 * person or an invite), case-insensitively. Anything else is refused with every
 * value that exists, so the next attempt is a choice rather than a guess.
 */
function matchEntity(input: {
  name: string;
  raw: string;
  collection: AssistantEntityCollection;
  entries: readonly Entry[];
}): EntityResolution {
  const { name, raw, collection, entries } = input;
  const normalized = raw.trim().toLowerCase();
  const byId = entries.filter((entry) => entry.id.toLowerCase() === normalized);
  const matches = byId.length
    ? byId
    : entries.filter((entry) =>
        [entry.name, entry.email].some(
          (value) => value?.toLowerCase() === normalized,
        ),
      );
  const only = matches.length === 1 ? matches[0] : undefined;
  if (only) return { ok: true, params: { [name]: only.id } };
  const candidates = matches.length ? matches : entries;
  const accepted = candidates.map(describe).join(", ") || "there are none yet";
  return {
    ok: false,
    code: matches.length ? "ambiguous_entity" : "unknown_entity",
    message: `"${name}" ${JSON.stringify(raw)} ${
      matches.length ? "is ambiguous in" : "does not exist in"
    } ${collection}. Accepted values: ${accepted}. Pass an id, or ask the user which one they mean.`,
  };
}

const describe = (entry: Entry): string =>
  `${entry.name}${entry.email && entry.email !== entry.name ? ` <${entry.email}>` : ""} (id ${entry.id})`;
