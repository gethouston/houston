import { readFileSync } from "node:fs";
import type ts from "typescript";
import {
  ASSISTANT_GROUPS,
  type AssistantOperation,
  type OperationAnnotation,
  type UnroutableOperation,
} from "./assistant-catalog-types.ts";
import type { Declaration } from "./assistant-declarations.ts";
import {
  humanizeMethodName,
  leadingJsDoc,
  parseAssistantDocs,
} from "./assistant-jsdoc.ts";
import {
  callerParameters,
  declarationLocation,
  parametersOf,
  returnsOf,
} from "./assistant-operation-parts.ts";
import { extractRoute, type RouteContext } from "./assistant-route.ts";
import { isFallback, schemaForType } from "./assistant-schema.ts";

/** Everything one pass accumulates, operation by operation. */
export interface Collected {
  operations: AssistantOperation[];
  annotations: OperationAnnotation[];
  undocumented: string[];
  ungrouped: string[];
  misgrouped: string[];
  unschematized: string[];
  unroutable: UnroutableOperation[];
}

export function emptyCollection(): Collected {
  return {
    operations: [],
    annotations: [],
    undocumented: [],
    ungrouped: [],
    misgrouped: [],
    unschematized: [],
    unroutable: [],
  };
}

/** One declaration read as an operation, before anything is recorded. */
export interface ReadOperation {
  operation: AssistantOperation;
  annotation: OperationAnnotation;
  /** `param` / `returns` names whose schema fell back to free-form. */
  unschematized: string[];
  /** Why no route could be derived, or `null` when one was. */
  unroutable: string | null;
}

/** The route already published, so a second name for it can be recognized. */
export const routeKey = (operation: AssistantOperation): string | null =>
  operation.route ? `${operation.route.method} ${operation.route.path}` : null;

/**
 * The JSDoc that documents a declaration: the block above the declaration
 * itself, or above the property that publishes it. A module factory's member
 * is written both ways — a block above the entry in the returned object, and a
 * block above the local a shorthand entry names — so both are tried, nearest
 * first.
 */
function docsFor(declaration: Declaration): string | undefined {
  for (const node of declaration.docs) {
    const source = node.getSourceFile();
    const block = leadingJsDoc(
      readFileSync(source.fileName, "utf8"),
      node.getStart(source),
    );
    if (block) return block;
  }
  return undefined;
}

/**
 * Read one declaration as an operation, or `null` when it is not one.
 *
 * Route first, schemas second: a declaration that never reaches the wire is
 * not an operation, and typing its parameters would file coverage gaps against
 * a function the catalog does not contain. The route is also what identifies
 * each parameter — `/agents/{x}` says `x` is an agent.
 */
export function readOperation(
  declaration: Declaration,
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  context: RouteContext,
): ReadOperation | null {
  const routing = extractRoute(
    declaration,
    callerParameters(declaration),
    context,
  );
  if (routing.reason === "no request call") return null;
  const docs = parseAssistantDocs(docsFor(declaration));
  const { params, unschematized, openIdentifiers } = parametersOf(
    declaration,
    checker,
    source,
    { docs: docs.params, route: routing.route, operation: declaration.name },
  );
  const returnType = routing.returns ?? returnsOf(declaration, checker);
  const returns = returnType
    ? schemaForType(checker, returnType, declaration.node)
    : { $comment: "unschematized: unknown" };
  if (isFallback(returns)) unschematized.push("returns");
  return {
    operation: {
      name: declaration.name,
      group: docs.group || "system",
      description: docs.description ?? humanizeMethodName(declaration.name),
      confirm: docs.confirm,
      hidden: docs.hidden,
      ...(docs.hiddenReason ? { hiddenReason: docs.hiddenReason } : {}),
      ...(docs.unconfirmed ? { unconfirmed: docs.unconfirmed } : {}),
      params,
      returns,
      route: routing.route,
    },
    annotation: {
      name: declaration.name,
      location: declarationLocation(declaration, source),
      documented: docs.description !== undefined,
      group: docs.group,
      hidden: docs.hidden,
      hiddenReason: docs.hiddenReason,
      method: routing.route?.method,
      confirm: docs.confirm,
      unconfirmed: docs.unconfirmed,
      unroutableReason: docs.unroutableReason,
      unschematizedReason: docs.unschematizedReason,
      unknownTags: docs.unknownTags,
      routable: routing.route !== null,
      unschematizedFields: unschematized,
      openIdentifiers,
    },
    unschematized,
    unroutable: routing.reason,
  };
}

/** Record an operation and everything the coverage gate reads off it. */
export function recordOperation(
  read: ReadOperation,
  collected: Collected,
): void {
  const { annotation, operation } = read;
  if (read.unroutable !== null)
    collected.unroutable.push({
      name: operation.name,
      reason: read.unroutable,
    });
  if (!annotation.documented) collected.undocumented.push(operation.name);
  if (!annotation.group) collected.ungrouped.push(operation.name);
  else if (!ASSISTANT_GROUPS.includes(annotation.group))
    collected.misgrouped.push(`${operation.name}: ${annotation.group}`);
  collected.unschematized.push(
    ...read.unschematized.map((field) => `${operation.name}.${field}`),
  );
  collected.operations.push(operation);
  collected.annotations.push(annotation);
}
