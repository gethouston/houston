import type { ModelPickerModel, ModelPickerProvider } from "@houston-ai/core";

import type { SpecimenProp } from "../../../src/specimen";

/**
 * Sample catalog, taken from the shipped model catalog
 * (`app/src/lib/ai-hub/model-catalog.json`) so the rows read like the app's.
 * Google is mid-check and Mistral is disconnected — neither ever reaches the
 * list, which is the picker's one hard rule.
 */
export const providers: ModelPickerProvider[] = [
  { id: "anthropic", name: "Anthropic", connection: "connected" },
  { id: "openai", name: "OpenAI", connection: "connected" },
  { id: "google", name: "Google", connection: "checking" },
  { id: "mistral", name: "Mistral", connection: "disconnected" },
];

export const models: ModelPickerModel[] = [
  {
    id: "anthropic/claude-opus-4-5",
    name: "Claude Opus 4.5",
    providerId: "anthropic",
    description: "Deep reasoning, coding and long-horizon agents",
  },
  {
    id: "anthropic/claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    providerId: "anthropic",
    description: "The everyday workhorse",
  },
  {
    id: "anthropic/claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    providerId: "anthropic",
  },
  {
    id: "openai/gpt-4-1",
    name: "GPT-4.1",
    providerId: "openai",
    description: "Coding and instruction following",
  },
  { id: "openai/gpt-4-1-mini", name: "GPT-4.1 mini", providerId: "openai" },
  { id: "openai/gpt-4o", name: "GPT-4o", providerId: "openai" },
];

/** Nine Anthropic rows — one over the picker's search threshold of eight. */
export const longCatalog: ModelPickerModel[] = [
  ...models.filter((model) => model.providerId === "anthropic"),
  {
    id: "anthropic/claude-opus-4-6",
    name: "Claude Opus 4.6",
    providerId: "anthropic",
  },
  {
    id: "anthropic/claude-opus-4-7",
    name: "Claude Opus 4.7",
    providerId: "anthropic",
  },
  {
    id: "anthropic/claude-opus-4-8",
    name: "Claude Opus 4.8",
    providerId: "anthropic",
  },
  {
    id: "anthropic/claude-opus-4-1",
    name: "Claude Opus 4.1",
    providerId: "anthropic",
  },
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    providerId: "anthropic",
  },
  {
    id: "anthropic/claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    providerId: "anthropic",
  },
  {
    id: "anthropic/claude-haiku-3-5",
    name: "Claude Haiku 3.5",
    providerId: "anthropic",
  },
];

export const onlyAnthropic: ModelPickerProvider[] = [providers[0]];

export const nothingConnected: ModelPickerProvider[] = [
  { id: "google", name: "Google", connection: "disconnected" },
  { id: "mistral", name: "Mistral", connection: "disconnected" },
];

export const stillChecking: ModelPickerProvider[] = [
  { id: "anthropic", name: "Anthropic", connection: "checking" },
  { id: "openai", name: "OpenAI", connection: "checking" },
];

/** The picker's public API, read off `model-picker/types.ts`. */
export const modelPickerProps: SpecimenProp[] = [
  {
    name: "models",
    type: "ModelPickerModel[]",
    note: "{ id, name, providerId, description? }. Grouped by providerId.",
  },
  {
    name: "providers",
    type: "ModelPickerProvider[]",
    note: '{ id, name, connection }. Only "connected" ones are ever listed.',
  },
  {
    name: "selectedId",
    type: "string",
    note: "The current model's id — draws the check on both levels.",
  },
  {
    name: "catalogState",
    type: '"ready" | "loading"',
    note: 'Defaults to "ready". Loading holds the neutral state instead of "no providers".',
  },
  {
    name: "onSelect",
    type: "(id: string) => void",
    note: "Required. Fires with the model id from level 2.",
  },
  {
    name: "onConnectMore",
    type: "() => void",
    note: "Adds the footer affordance and the empty state's action. Omit both when the viewer cannot connect.",
  },
  {
    name: "renderProviderIcon",
    type: "(providerId: string, className?: string) => React.ReactNode",
    note: "App-supplied brand logo. Falls back to the provider's initial.",
  },
  {
    name: "labels",
    type: "Partial<ModelPickerLabels>",
    note: "Every user-facing string, so the component stays i18n-agnostic.",
  },
  {
    name: "footer",
    type: "React.ReactNode",
    note: "Non-interactive note pinned last — e.g. a workspace policy line.",
  },
  { name: "className", type: "string", note: "Merged onto the Command root." },
];

/** Every colour utility the picker and its rows paint with. */
export const modelPickerTokens = [
  "text-ink",
  "text-ink-muted",
  "border-line",
  "border-line/60",
  "bg-hover",
  "text-hover-text",
  "bg-action",
  "text-action-text",
];
