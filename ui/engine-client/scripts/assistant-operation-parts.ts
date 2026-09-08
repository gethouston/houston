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
import { repoRelative } from "./assistant-paths.ts";
import { isFallback, schemaForType } from "./assistant-schema.ts";

/** The parameter names a caller supplies, which is all a route may read. */
export function callerParameters(declaration: Declaration): Set<string> {
  return new Set(
    declaration.node.parameters
      .filter((parameter) => !isPlumbingParameter(parameter))
      .flatMap((parameter) =>
        ts.isIdentifier(parameter.name) ? [parameter.name.text] : [],
      ),
  );
}

export interface OperationParameters {
  params: AssistantParameter[];
  /** Parameter names whose schema fell back to a free-form comment. */
  unschematized: string[];
  /**
   * Parameter names that address an existing thing with nothing behind them:
   * no closed set, no live list, no stated reason. The coverage gate fails on
   * these, because the alternative is a model inventing an id.
   */
  openIdentifiers: string[];
}

/** Everything outside the signature that a parameter's entry carries. */
export interface ParameterContext {
  /** `@param` lines from the operation's JSDoc, by parameter name. */
  docs: Readonly<Record<string, string>>;
  /** The operation's own route, which is what identifies a path parameter. */
  route: AssistantRoute | null;
  /** The operation's own name — it can never be its own discovery source. */
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
  const params = declaration.node.parameters
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
      // A closed schema already carries its values: naming a discovery
      // operation, a live list or a reason on top of it would send the model
      // on a lookup it does not need. And nothing lists itself.
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
      return {
        name,
        required: !parameter.questionToken && !parameter.initializer,
        schema,
        ...(context.docs[name] ? { description: context.docs[name] } : {}),
        ...identity,
      };
    });
  return { params, unschematized, openIdentifiers };
}

/**
 * A schema that already states every value it accepts. The `{type: "null"}`
 * branch is how an optional value is spelled, so it neither opens nor closes
 * the set — matching how the runtime reads the same schemas
 * (packages/runtime/src/session/tools/assistant-schema-hint.ts).
 */
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

/** `file:line` of a declaration, for the coverage gate's output. */
export function declarationLocation(
  declaration: Declaration,
  source: ts.SourceFile,
): string {
  const { line } = source.getLineAndCharacterOfPosition(
    declaration.node.getStart(source),
  );
  return `${repoRelative(source.fileName)}:${line + 1}`;
}
