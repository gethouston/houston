import type {
  AssistantOperation,
  AssistantOperationParam,
} from "@houston/host/src/assistant/catalog";
import { acceptedValues } from "./assistant-schema-hint";

function renderParam(param: AssistantOperationParam): Record<string, unknown> {
  return {
    name: param.name,
    required: param.required,
    ...(param.description ? { description: param.description } : {}),
    ...(param.source ? { valuesFrom: param.source } : {}),
    ...(param.fields
      ? {
          fields: param.fields.map((field) => ({
            name: field.name,
            ...(field.source ? { valuesFrom: field.source } : {}),
            ...(field.resolver
              ? { houstonResolves: true }
              : field.unresolved
                ? { note: field.unresolved }
                : {}),
          })),
        }
      : {}),
    schema: param.schema,
  };
}

export function sourceGuidance(op: AssistantOperation): string {
  const sourced = op.params.flatMap((param) => [
    ...(param.source && !param.resolver
      ? [`"${param.name}" from ${param.source}`]
      : []),
    ...(param.fields ?? []).flatMap((field) =>
      field.source && !field.resolver
        ? [`"${param.name}.${field.name}" from ${field.source}`]
        : [],
    ),
  ]);
  if (sourced.length === 0) return "";
  return ` Never invent an identifier: take ${sourced.join(", ")}. Call ${
    sourced.length === 1 ? "that operation" : "those operations"
  } with houston_call first unless you already have the exact value the user gave you.`;
}

export function resolutionGuidance(op: AssistantOperation): string {
  const resolved = op.params.flatMap((param) => [
    ...(param.resolver ? [`"${param.name}"`] : []),
    ...(param.fields ?? []).flatMap((field) =>
      field.resolver ? [`"${param.name}.${field.name}"`] : [],
    ),
  ]);
  if (resolved.length === 0) return "";
  return ` The app resolves ${resolved.join(", ")} against what exists: pass the id, or the exact name the user gave you. A value that matches nothing is refused with the ones that do.`;
}

export function choiceGuidance(op: AssistantOperation): string {
  const closed = op.params.flatMap((param) => {
    const values = acceptedValues(param.schema);
    return values ? [`"${param.name}" is one of: ${values.join(", ")}`] : [];
  });
  return closed.length === 0 ? "" : ` Exact choices: ${closed.join("; ")}.`;
}

export function describeOperation(op: AssistantOperation): string {
  const contract = JSON.stringify({
    name: op.name,
    group: op.group,
    description: op.description,
    confirm: op.confirm,
    params: op.params.map(renderParam),
    returns: op.returns,
  });
  const guidance = op.confirm
    ? " This operation is hard to undo, so the app asks the user itself: call houston_call normally, and if it answers ERROR needs_confirmation, end your turn and wait for their decision on the card the app shows them."
    : "";
  return `${contract}\n\nPass these to houston_call keyed by parameter name.${choiceGuidance(op)}${resolutionGuidance(op)}${sourceGuidance(op)}${guidance}`;
}
