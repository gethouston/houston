import type { AssistantEntityCollection } from "@houston/domain/assistant-catalog-types";
import type { AssistantOperation } from "./catalog";
import type { EntityDirectory } from "./entity-directory";
import {
  DirectoryReader,
  type EntityRefusal,
  type EntityResolutionCode,
  resolveEntityValue,
} from "./entity-resolution-values";
import { valueProblem } from "./entity-values";

export type { EntityResolutionCode } from "./entity-resolution-values";

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

interface Reference {
  /** How the value is named in a refusal: `agentId`, or `manifest.enabled`. */
  label: string;
  collection: AssistantEntityCollection;
}

/** Resolve parent scopes before children regardless of declaration order. */
function ordered(refs: Reference[]): Reference[] {
  return [...refs].sort(
    (a, b) => (PARENT[a.collection] ? 1 : 0) - (PARENT[b.collection] ? 1 : 0),
  );
}

/** The parameters that name a thing, top level. */
function identifiers(op: AssistantOperation): Reference[] {
  return ordered(
    op.params.flatMap((param) =>
      param.resolver ? [{ label: param.name, collection: param.resolver }] : [],
    ),
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
 *
 * THREE shapes, because an identifier does not only arrive as a top-level
 * string: a parameter can carry a LIST of them, and a body object can carry
 * them one level in (`manifest.enabled`, `assignments[].userId`). Those were
 * invisible here while the catalog said `string`, so the model's guess went
 * straight through the approval card and into the request.
 */
export async function resolveEntityParams(
  op: AssistantOperation,
  params: Record<string, unknown>,
  deps: EntityResolutionDeps,
): Promise<EntityResolution> {
  const resolved = { ...params };
  const reader = new DirectoryReader(deps);
  const refs = identifiers(op);
  for (const { label, collection } of refs) {
    if (!Object.hasOwn(params, label) || params[label] === undefined) continue;
    const scope = scopeFor(label, collection, refs, resolved);
    if (!scope.ok) return scope;
    const value = await resolveEntityValue({
      label,
      value: resolved[label],
      collection,
      scope: scope.scope,
      reader,
    });
    if (!value.ok) return value;
    resolved[label] = value.value;
  }
  const nested = await resolveNestedFields(op, resolved, refs, reader);
  if (!nested.ok) return nested;
  const problem = valueProblem(op, nested.params);
  return problem
    ? { ok: false, code: "invalid_params", message: problem }
    : { ok: true, params: nested.params };
}

/** The already-resolved parent id a child collection is listed under. */
function scopeFor(
  label: string,
  collection: AssistantEntityCollection,
  refs: readonly Reference[],
  resolved: Record<string, unknown>,
): { ok: true; scope: string } | EntityRefusal {
  const parent = PARENT[collection];
  if (!parent) return { ok: true, scope: "" };
  const holder = refs.find((ref) => ref.collection === parent)?.label ?? "";
  const scope = resolved[holder];
  if (typeof scope !== "string" || !scope) {
    return {
      ok: false,
      code: "invalid_params",
      message: `"${label}" requires a resolved ${parent} scope.`,
    };
  }
  return { ok: true, scope };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The identifiers a body object carries one level in, resolved in place. The
 * fields are the catalog's declaration (`AssistantFieldDocument`), and the
 * VALUE decides which shape they apply to: an object's property, the same
 * property of every element of a list of objects, or every entry of a list the
 * field itself holds.
 */
async function resolveNestedFields(
  op: AssistantOperation,
  params: Record<string, unknown>,
  refs: readonly Reference[],
  reader: DirectoryReader,
): Promise<{ ok: true; params: Record<string, unknown> } | EntityRefusal> {
  const resolved = { ...params };
  for (const param of op.params) {
    const fields = param.fields?.filter((field) => field.resolver) ?? [];
    if (fields.length === 0) continue;
    const value = resolved[param.name];
    if (value === undefined) continue;
    const items = Array.isArray(value) ? value : [value];
    const next: unknown[] = [];
    for (const item of items) {
      if (!isRecord(item)) {
        next.push(item);
        continue;
      }
      const copy = { ...item };
      for (const field of fields) {
        const collection = field.resolver;
        if (!collection || copy[field.name] === undefined) continue;
        const label = `${param.name}.${field.name}`;
        const scope = scopeFor(label, collection, refs, resolved);
        if (!scope.ok) return scope;
        const one = await resolveEntityValue({
          label,
          value: copy[field.name],
          collection,
          scope: scope.scope,
          reader,
        });
        if (!one.ok) return one;
        copy[field.name] = one.value;
      }
      next.push(copy);
    }
    resolved[param.name] = Array.isArray(value) ? next : next[0];
  }
  return { ok: true, params: resolved };
}
