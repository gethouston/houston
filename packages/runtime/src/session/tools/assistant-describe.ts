import type {
  AssistantOperation,
  AssistantOperationParam,
} from "@houston/host/src/assistant/catalog";
import { acceptedValues } from "./assistant-schema-hint";

/**
 * What `houston_describe` answers with.
 *
 * The schema alone says a parameter is a string; it never says WHICH string,
 * and an identifier the model is left to invent is one it will invent. The
 * generated catalog carries the missing half on each parameter — the author's
 * own sentence (`description`) and the operation that LISTS its accepted
 * values (`source`) — so the contract is rendered with both, and the closing
 * paragraph names, parameter by parameter, where each value is to be read
 * from. A model that knows to call `listAgents` first stops guessing agent
 * names on the second try instead of the fifth.
 */

/** One parameter as the model reads it, annotations included when present. */
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

/**
 * The sentence that ends the guessing: every parameter whose values live
 * somewhere else, and where. Empty when the operation has none, so an operation
 * that takes only free text is not given a paragraph about identifiers.
 */
export function sourceGuidance(op: AssistantOperation): string {
  const sourced = op.params.flatMap((param) => [
    ...(param.source && !param.resolver
      ? [`"${param.name}" from ${param.source}`]
      : []),
    // A body object hides its identifiers from a reader that stops at the top
    // level: the provider and model inside a `choice`, the toolkits inside a
    // settings ceiling. Named the way they are passed, so the sentence maps
    // onto the object the model is about to build.
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

/**
 * The sentence for the parameters Houston checks itself before it acts: the
 * model may pass the exact name the user said instead of spending a call on the
 * lookup first, and a value that matches nothing comes back with the ones that
 * do - so a wrong guess costs a correction, never a wrong thing done.
 */
export function resolutionGuidance(op: AssistantOperation): string {
  const resolved = op.params.flatMap((param) => [
    ...(param.resolver ? [`"${param.name}"`] : []),
    ...(param.fields ?? []).flatMap((field) =>
      field.resolver ? [`"${param.name}.${field.name}"`] : [],
    ),
  ]);
  if (resolved.length === 0) return "";
  return ` Houston resolves ${resolved.join(", ")} against what exists: pass the id, or the exact name the user gave you. A value that matches nothing is refused with the ones that do.`;
}

/**
 * The sentence for parameters whose schema is already a closed set: the values
 * are right there, so the instruction is to pick one rather than to look it up.
 */
export function choiceGuidance(op: AssistantOperation): string {
  const closed = op.params.flatMap((param) => {
    const values = acceptedValues(param.schema);
    return values ? [`"${param.name}" is one of: ${values.join(", ")}`] : [];
  });
  return closed.length === 0 ? "" : ` Exact choices: ${closed.join("; ")}.`;
}

/** The whole answer: the contract, then how to fill it in without guessing. */
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
    ? " This operation is hard to undo, so Houston asks the user itself: call houston_call normally, and if it answers ERROR needs_confirmation, end your turn and wait for their decision on the card Houston shows them."
    : "";
  return `${contract}\n\nPass these to houston_call keyed by parameter name.${choiceGuidance(op)}${resolutionGuidance(op)}${sourceGuidance(op)}${guidance}`;
}
