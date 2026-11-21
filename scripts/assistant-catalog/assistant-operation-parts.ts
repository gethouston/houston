import ts from "typescript";
import type {
  AssistantParameter,
  AssistantRoute,
} from "./assistant-catalog-types.ts";
import {
  type Declaration,
  isPlumbingParameter,
} from "./assistant-declarations.ts";
import { entityRuleFor, namesEntity } from "./assistant-entity-sources.ts";
import { nestedFieldsFor } from "./assistant-nested-fields.ts";
import { repoRelative } from "./assistant-paths.ts";
import { isFallback, schemaForType } from "./assistant-schema.ts";

export function callerParameters(declaration: Declaration): Set<string> {
  return new Set(
    declaration.node.parameters
      .filter((parameter) => !isPlumbingParameter(parameter))
      .flatMap((parameter) =>
        ts.isIdentifier(parameter.name) ? [parameter.name.text] : [],
      ),
  );
}

function publishedParameters(
  declaration: Declaration,
  checker: ts.TypeChecker,
): readonly ts.ParameterDeclaration[] {
  const { node } = declaration;
  const name = ts.isArrowFunction(node) ? undefined : node.name;
  const overload = name
    ? checker
        .getSymbolAtLocation(name)
        ?.declarations?.find(
          (other) =>
            other !== node &&
            (ts.isFunctionDeclaration(other) ||
              ts.isMethodDeclaration(other)) &&
            other.body === undefined,
        )
    : undefined;
  return overload && ts.isFunctionLike(overload)
    ? overload.parameters
    : node.parameters;
}

export function unpublishedPathParams(
  route: AssistantRoute,
  declaration: Declaration,
  checker: ts.TypeChecker,
  source: ts.SourceFile,
): string[] {
  const published = new Set(
    publishedParameters(declaration, checker)
      .filter((parameter) => !isPlumbingParameter(parameter))
      .map((parameter) => parameter.name.getText(source)),
  );
  return route.pathParams
    .map(({ name }) => name)
    .filter((name) => !published.has(name));
}

export interface OperationParameters {
  params: AssistantParameter[];
  unschematized: string[];
  openIdentifiers: string[];
}

export interface ParameterContext {
  docs: Readonly<Record<string, string>>;
  route: AssistantRoute | null;
  operation: string;
}

export function parametersOf(
  declaration: Declaration,
  checker: ts.TypeChecker,
  source: ts.SourceFile,
  context: ParameterContext,
): OperationParameters {
  const unschematized: string[] = [];
  const openIdentifiers: string[] = [];
  const params = publishedParameters(declaration, checker)
    .filter((parameter) => !isPlumbingParameter(parameter))
    .map((parameter) => {
      const name = parameter.name.getText(source);
      const schema = schemaForType(
        checker,
        checker.getTypeAtLocation(parameter),
        parameter,
      );
      if (isFallback(schema)) unschematized.push(name);
      const closed = isClosed(schema);
      const rule = entityRuleFor(name, context.route);
      if (
        !closed &&
        !rule?.collection &&
        !rule?.unlisted &&
        namesEntity(name, context.route)
      )
        openIdentifiers.push(name);
      const identity =
        closed || !rule
          ? {}
          : {
              ...(rule.collection ? { resolver: rule.collection } : {}),
              ...(rule.unlisted ? { unresolved: rule.unlisted } : {}),
              ...(rule.discovery && rule.discovery !== context.operation
                ? { source: rule.discovery }
                : {}),
            };
      const fields = nestedFieldsFor(
        name,
        schema,
        context.route,
        context.operation,
      );
      return {
        name,
        required: !parameter.questionToken && !parameter.initializer,
        schema,
        ...(context.docs[name] ? { description: context.docs[name] } : {}),
        ...identity,
        ...(fields.length > 0 ? { fields } : {}),
      };
    });
  return { params, unschematized, openIdentifiers };
}

function isClosed(schema: Record<string, unknown>): boolean {
  if ("const" in schema || Array.isArray(schema.enum)) return true;
  const branches = schema.anyOf;
  if (!Array.isArray(branches)) return false;
  const choices = (branches as Record<string, unknown>[]).filter(
    (branch) => branch.type !== "null" || "const" in branch,
  );
  return choices.length > 0 && choices.every(isClosed);
}

export function returnsOf(
  declaration: Declaration,
  checker: ts.TypeChecker,
): ts.Type | null {
  const signature = checker.getSignatureFromDeclaration(declaration.node);
  return signature ? checker.getReturnTypeOfSignature(signature) : null;
}

export function declarationLocation(
  declaration: Declaration,
  source: ts.SourceFile,
): string {
  const { line } = source.getLineAndCharacterOfPosition(
    declaration.node.getStart(source),
  );
  return `${repoRelative(source.fileName)}:${line + 1}`;
}
