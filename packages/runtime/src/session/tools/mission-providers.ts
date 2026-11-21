import {
  MAX_NAMED_MODELS,
  namedModelList,
  type ProviderOption,
} from "@houston/domain";
import { type TOptional, type TString, Type } from "typebox";

const DESCRIBED_MODELS_PER_PROVIDER = MAX_NAMED_MODELS;

const CONNECTED = (options: readonly ProviderOption[]) =>
  options.filter((o) => o.connected);

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
  return param as unknown as TOptional<TString>;
}

export function missionProviderDescription(
  options: readonly ProviderOption[],
  personalAssistant = false,
): string {
  const pairs = CONNECTED(options)
    .map((o) => `${o.id} = ${o.name}`)
    .join(", ");
  const lookup = personalAssistant
    ? " Every provider, connected or not, is listAgentProviders."
    : "";
  return `Pin a specific AI provider for the mission (omit to use the agent's current one). Connected here: ${pairs}. Use the id on the left, exactly as written.${lookup}`;
}

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
