import ts from "typescript";
import type {
  AssistantParameter,
  AssistantRoute,
} from "./assistant-catalog-types.ts";
import {
  type Declaration,
  isPlumbingParameter,
} from "./assistant-declarations.ts";
import { entitySourceFor } from "./assistant-entity-sources.ts";
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
      const source_ = entitySourceFor(name, context.route);
      return {
        name,
        required: !parameter.questionToken && !parameter.initializer,
        schema,
        ...(context.docs[name] ? { description: context.docs[name] } : {}),
        // A closed schema already carries its values; naming a discovery
        // operation on top of it would send the model on a lookup it does not
        // need. And nothing lists itself.
        ...(source_ && source_ !== context.operation && !isClosed(schema)
          ? { source: source_ }
          : {}),
      };
    });
  return { params, unschematized };
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
