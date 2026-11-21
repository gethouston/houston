import { readFileSync } from "node:fs";
import { parseAssistantHands } from "@houston/domain/assistant-hands";
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
  unpublishedPathParams,
} from "./assistant-operation-parts.ts";
import { extractRoute, type RouteContext } from "./assistant-route.ts";
import { isFallback, schemaForType } from "./assistant-schema.ts";

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

export interface ReadOperation {
  operation: AssistantOperation;
  annotation: OperationAnnotation;
  unschematized: string[];
  unroutable: string | null;
}

export const routeKey = (operation: AssistantOperation): string | null =>
  operation.route ? `${operation.route.method} ${operation.route.path}` : null;

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
  const unpublished = routing.route
    ? unpublishedPathParams(routing.route, declaration, checker, source)
    : [];
  const route = unpublished.length > 0 ? null : routing.route;
  const unroutable =
    unpublished.length > 0
      ? `the path names ${unpublished.join(", ")}, which the published signature does not declare`
      : routing.reason;
  const docs = parseAssistantDocs(docsFor(declaration));
  const hands = docs.handsCard
    ? parseAssistantHands(docs.handsCard)
    : undefined;
  const { params, unschematized, openIdentifiers } = parametersOf(
    declaration,
    checker,
    source,
    { docs: docs.params, route, operation: declaration.name },
  );
  const returnType =
    (route ? routing.returns : null) ?? returnsOf(declaration, checker);
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
      ...(hands && hands.kind !== "invalid" ? { hands } : {}),
      params,
      returns,
      route,
    },
    annotation: {
      name: declaration.name,
      location: declarationLocation(declaration, source),
      documented: docs.description !== undefined,
      group: docs.group,
      hidden: docs.hidden,
      hiddenReason: docs.hiddenReason,
      handsCard: docs.handsCard,
      method: route?.method,
      confirm: docs.confirm,
      confirmed: docs.confirmed,
      unconfirmed: docs.unconfirmed,
      unroutableReason: docs.unroutableReason,
      unschematizedReason: docs.unschematizedReason,
      unknownTags: docs.unknownTags,
      routable: route !== null,
      unschematizedFields: unschematized,
      openIdentifiers,
    },
    unschematized,
    unroutable,
  };
}

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
