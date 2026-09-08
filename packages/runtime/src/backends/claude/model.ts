/**
 * Map a Houston pi model id to the Claude Agent SDK's `model` string.
 *
 * Houston's `anthropic` provider uses the native Anthropic API ids (dash form:
 * `claude-sonnet-4-6`, `claude-opus-4-5`, …) and the SDK's `Options.model`
 * accepts those verbatim, as it does the bare family names (`sonnet`, `opus`,
 * `haiku`). The two dialects agree today, so this is a pass-through.
 *
 * It stays a NAMED seam rather than an inlined identity because it is the one
 * place the two vocabularies meet: the three SDK call sites (session, one-shot,
 * backend) already route through it, so the day an id needs rewriting there is
 * exactly one edit and no call site to hunt down.
 */
export function toSdkModel(modelId: string): string {
  return modelId;
}
