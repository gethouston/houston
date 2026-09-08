import ts from "typescript";
import type { AssistantParameter } from "./assistant-catalog-types.ts";
import {
  type Declaration,
  isPlumbingParameter,
} from "./assistant-declarations.ts";
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

export function parametersOf(
  declaration: Declaration,
  checker: ts.TypeChecker,
  source: ts.SourceFile,
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
      return {
        name,
        required: !parameter.questionToken && !parameter.initializer,
        schema,
      };
    });
  return { params, unschematized };
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
