import type { AssistantEntityCollection } from "@houston/domain/assistant-catalog-types";
import { resolveAgentReference } from "./entity-agent-resolution";
import type { EntityDirectory } from "./entity-directory";
import { directoryEntries } from "./entity-resolution-directory";

/**
 * ONE VALUE against ONE live list, and the shapes a value arrives in.
 *
 * Split from `entity-resolution.ts` because the same matching now answers three
 * questions: a parameter that names a thing, a parameter that names a LIST of
 * things (`assignments`), and a field one level inside a body object (a
 * manifest's enabled skills). All three end in the same refusal when the value
 * does not exist - carrying every value that does, so the next attempt is a
 * choice rather than a guess.
 */

export type EntityResolutionCode =
  | "invalid_params"
  | "unknown_agent"
  | "ambiguous_agent"
  | "unknown_entity"
  | "ambiguous_entity";

export interface EntityRefusal {
  ok: false;
  code: EntityResolutionCode;
  message: string;
}

interface Entry {
  id: string;
  name: string;
  email?: string;
}

/**
 * The live lists one resolution reads, memoized for the CALL. A list-valued
 * parameter would otherwise refetch the same directory once per entry, and two
 * reads that disagree would refuse with values from neither.
 */
export class DirectoryReader {
  private readonly cache = new Map<string, Promise<readonly Entry[]>>();

  constructor(private readonly deps: EntityDirectory) {}

  agents() {
    return this.deps.agents();
  }

  entries(
    collection: Exclude<AssistantEntityCollection, "agents">,
    scope: string,
  ): Promise<readonly Entry[]> {
    const key = `${collection} ${scope}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const read = directoryEntries(collection, this.deps, scope);
    this.cache.set(key, read);
    return read;
  }
}

/** One value, or every entry of a list of them, resolved to real ids. */
export async function resolveEntityValue(input: {
  /** How the value is named in a refusal: `agentId`, or `manifest.enabled`. */
  label: string;
  value: unknown;
  collection: AssistantEntityCollection;
  scope: string;
  reader: DirectoryReader;
}): Promise<{ ok: true; value: unknown } | EntityRefusal> {
  const { value } = input;
  if (!Array.isArray(value)) {
    const one = await resolveScalar(input, value);
    return one.ok ? { ok: true, value: one.id } : one;
  }
  const entries: unknown[] = [];
  for (const entry of value) {
    // An OBJECT entry is not this identifier: it is a record carrying its own
    // declared fields (`assignments` is either a list of user ids or a list of
    // {userId, access}), and the nested pass owns it. Resolving it here would
    // refuse the whole call over a shape the catalog explicitly allows.
    if (isRecord(entry)) {
      entries.push(entry);
      continue;
    }
    const one = await resolveScalar(input, entry);
    if (!one.ok) return one;
    entries.push(one.id);
  }
  return { ok: true, value: entries };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function resolveScalar(
  input: {
    label: string;
    collection: AssistantEntityCollection;
    scope: string;
    reader: DirectoryReader;
  },
  raw: unknown,
): Promise<{ ok: true; id: string } | EntityRefusal> {
  const { label, collection, scope, reader } = input;
  if (typeof raw !== "string" || !raw.trim()) {
    return {
      ok: false,
      code: "invalid_params",
      message: `"${label}" must be a non-empty ${collection} id or exact name.`,
    };
  }
  if (collection === "agents") {
    const result = resolveAgentReference(label, raw, await reader.agents());
    return result.ok
      ? { ok: true, id: String(result.params[label]) }
      : { ok: false, code: result.code, message: result.message };
  }
  return matchEntity(
    label,
    raw,
    collection,
    await reader.entries(collection, scope),
  );
}

/**
 * One value against one live list: its id, or its exact name (an address for a
 * person or an invite), case-insensitively. Anything else is refused with every
 * value that exists.
 */
function matchEntity(
  label: string,
  raw: string,
  collection: AssistantEntityCollection,
  entries: readonly Entry[],
): { ok: true; id: string } | EntityRefusal {
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
  if (only) return { ok: true, id: only.id };
  const candidates = matches.length ? matches : entries;
  const accepted = candidates.map(describe).join(", ") || "there are none yet";
  return {
    ok: false,
    code: matches.length ? "ambiguous_entity" : "unknown_entity",
    message: `"${label}" ${JSON.stringify(raw)} ${
      matches.length ? "is ambiguous in" : "does not exist in"
    } ${collection}. Accepted values: ${accepted}. Pass an id, or ask the user which one they mean.`,
  };
}

const describe = (entry: Entry): string =>
  `${entry.name}${entry.email && entry.email !== entry.name ? ` <${entry.email}>` : ""} (id ${entry.id})`;
