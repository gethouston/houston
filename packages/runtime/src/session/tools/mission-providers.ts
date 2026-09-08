import {
  MAX_NAMED_MODELS,
  modelDisplayName,
  namedModelList,
  type ProviderOption,
  resolveModelChoice,
  resolveProviderChoice,
} from "@houston/domain";
import { type TOptional, type TString, Type } from "typebox";
import type { TurnModel } from "../turn-model-context";
import { START_MISSION_TOOL_NAME } from "./mission-tool-names";

/**
 * The mission pin's provider/model surface: the closed set of provider ids the
 * SCHEMA offers, the sentence that pairs each id with its display name, and the
 * live resolution of whatever the model wrote.
 *
 * Both halves are needed and neither replaces the other. The schema is built
 * once per session and then FROZEN into the prompt prefix (the tool defs are
 * cached), so a provider the user connects — or disconnects — mid-session is
 * not reflected in it; the live resolution here, and the host's own check at
 * `POST /sandbox/missions/start`, are what catch that drift. The schema's job is
 * to stop the guessing before it starts.
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
 * {@link resolveMissionPin} and the host.
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

/**
 * Resolve what the model wrote into real ids, or throw the sentence that says
 * which values it could have used. `inherited` is the provider the mission would
 * ride when this call names none — the one a lone `model` is checked against.
 */
export function resolveMissionPin(
  params: { provider?: string; model?: string },
  options: readonly ProviderOption[],
  inherited?: string,
): { provider?: string; model?: string } {
  const pin: { provider?: string; model?: string } = {};
  if (params.provider) {
    const resolved = resolveProviderChoice(
      params.provider,
      options,
      START_MISSION_TOOL_NAME,
    );
    if (!resolved.ok) throw new Error(resolved.message);
    pin.provider = resolved.id;
  }
  if (params.model) {
    const against = options.find((o) => o.id === (pin.provider ?? inherited));
    if (!against) {
      pin.model = params.model.trim();
      return pin;
    }
    const resolved = resolveModelChoice(
      params.model,
      against,
      START_MISSION_TOOL_NAME,
    );
    if (!resolved.ok) throw new Error(resolved.message);
    pin.model = resolved.id;
  }
  return pin;
}

/**
 * The child mission's model pin: the agent's RESOLVED choice, defaulting to the
 * PARENT turn's provider/model — "omit to use the current one". The default is
 * load-bearing, not cosmetic: on managed cloud the runtime holds no standing
 * provider (the gateway injects one per USER send), so an unpinned child turn is
 * refused with "No provider connected". A model named WITHOUT a provider rides
 * the inherited provider; a provider named without a model gets that provider's
 * default (no cross-provider mixing of the parent's model id).
 */
export function missionPin(
  chosen: { provider?: string; model?: string },
  inherited: TurnModel | undefined,
): { provider?: string; model?: string } {
  if (chosen.provider) {
    return {
      provider: chosen.provider,
      ...(chosen.model ? { model: chosen.model } : {}),
    };
  }
  const provider = inherited?.provider;
  const model = chosen.model ?? inherited?.model;
  return {
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
  };
}

/**
 * What the tool may TELL the user a mission runs on: only ids that survived
 * resolution here AND the host's own check (a refusal never reaches this), and
 * nothing at all when the mission carries no pin. An echo of the request would
 * claim a provider the mission may never have run on.
 *
 * The model is named with the name the user knows it by, so a request that
 * could fit several rows ("use Sonnet") comes back saying WHICH one it pinned.
 */
export function missionRunsOn(
  pin: { provider?: string; model?: string },
  options: readonly ProviderOption[],
): string {
  if (!pin.provider && !pin.model) return "";
  const named = options.find((o) => o.id === pin.provider);
  const provider = pin.provider
    ? ` on ${pin.provider}${named ? ` (${named.name})` : ""}`
    : "";
  const spoken = pin.provider
    ? modelDisplayName(pin.provider, pin.model ?? "")
    : undefined;
  const model = pin.model
    ? ` with model ${pin.model}${spoken ? ` (${spoken})` : ""}`
    : "";
  return ` It runs${provider}${model}.`;
}
