import {
  MAX_NAMED_MODELS,
  namedModelList,
  type ProviderOption,
} from "@houston/domain";
import { type TOptional, type TString, Type } from "typebox";

/**
 * What the mission tools OFFER the model for a provider/model pin: the closed
 * set of provider ids the schema accepts, and the sentences that pair each id
 * with the display name — and each provider with the models — a user would say.
 *
 * This is built once per session and FROZEN into the prompt prefix (the tool
 * defs are cached), so it is a hint: its job is to stop the guessing before it
 * starts. What a written pin is HELD to is resolved when the tool runs, against
 * the acting member's live provider status (mission-pin.ts).
 */

/** Models named per provider in the DESCRIPTION — enough to cover every row a
 *  user can ask for by name without bloating a prompt prefix that is cached all
 *  session. */
const DESCRIBED_MODELS_PER_PROVIDER = MAX_NAMED_MODELS;

const CONNECTED = (options: readonly ProviderOption[]) =>
  options.filter((o) => o.connected);

/**
 * The `provider` param, or undefined when nothing is connected — an empty union
 * is not a schema, and "pick one of nothing" is not an instruction. The caller
 * omits the param entirely and the description says why.
 */
export function missionProviderParam(
  options: readonly ProviderOption[],
  personalAssistant = false,
): TOptional<TString> | undefined {
  const connected = CONNECTED(options);
  if (!connected.length) return undefined;
  const param = Type.Optional(
    Type.Union(
      connected.map((o) => Type.Literal(o.id)),
      { description: missionProviderDescription(options, personalAssistant) },
    ),
  );
  // SAFETY: the union accepts a SUBSET of `string`, and which subset is a
  // runtime snapshot of connected providers — so the static view callers get is
  // "an optional provider id". The accepted values live in the JSON Schema the
  // model reads, and `resolveMissionPin` is what narrows a value at runtime.
  return param as unknown as TOptional<TString>;
}

/** `openai-codex = ChatGPT / Codex (Plus / Pro), …` — the ids the schema
 *  accepts, each with the name the user would recognise. */
export function missionProviderDescription(
  options: readonly ProviderOption[],
  personalAssistant = false,
): string {
  const pairs = CONNECTED(options)
    .map((o) => `${o.id} = ${o.name}`)
    .join(", ");
  // Only the assistant can perform Houston operations, so only it is pointed at
  // one; every other agent has this list and its rejections, nothing to call.
  const lookup = personalAssistant
    ? " Every provider, connected or not, is listAgentProviders."
    : "";
  return `Pin a specific AI provider for the mission (omit to use the agent's current one). Connected here: ${pairs}. Use the id on the left, exactly as written.${lookup}`;
}

/**
 * The `model` param's description: `id = Friendly name` per connected provider.
 *
 * A model enum cannot live in this schema — the valid set depends on the
 * provider chosen in the SAME call, which one flat JSON Schema cannot express —
 * so the per-provider models are stated here and enforced live by
 * `resolveMissionPin` and the host.
 *
 * This sentence is also the ONLY place the friendly names reach an agent: the
 * `/providers` wire rows (what `listAgentProviders` reads) carry model IDS
 * only. A name the user says still resolves either way — `resolveMissionPin`
 * takes "Luna" as readily as `gpt-5.6-luna` — but naming the pairs here is what
 * stops the model from sending a provider alone because it could not place
 * "Luna", which is how a pinned mission ended up on the provider's default.
 */
export function missionModelDescription(
  options: readonly ProviderOption[],
): string {
  const connected = CONNECTED(options);
  if (!connected.length) {
    return "Pin a specific model id (omit for the provider's default). No AI provider is connected here, so the mission runs on the agent's current model.";
  }
  const lists = connected
    .filter((o) => o.models?.length)
    .map(
      (o) =>
        `${o.id}: ${namedModelList(o.id, o.models ?? [], DESCRIBED_MODELS_PER_PROVIDER)}`,
    )
    .join("; ");
  const known = lists
    ? ` Models per provider - ${lists}.`
    : " The connected providers take any model id their gateway serves.";
  return `Pin a specific model id for the provider this call names (omit for that provider's default). Either side of an "=" pair works: the id, or the name the user says for it.${known}`;
}
