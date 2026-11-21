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

const PARENT: Partial<
  Record<AssistantEntityCollection, AssistantEntityCollection>
> = {
  routines: "agents",
  skills: "agents",
  activities: "agents",
  "shared-skills": "workspaces",
};

interface Reference {
  label: string;
  collection: AssistantEntityCollection;
}

function ordered(refs: Reference[]): Reference[] {
  return [...refs].sort(
    (a, b) => (PARENT[a.collection] ? 1 : 0) - (PARENT[b.collection] ? 1 : 0),
  );
}

function identifiers(op: AssistantOperation): Reference[] {
  return ordered(
    op.params.flatMap((param) =>
      param.resolver ? [{ label: param.name, collection: param.resolver }] : [],
    ),
  );
}

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
