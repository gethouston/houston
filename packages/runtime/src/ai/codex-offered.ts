export const CODEX_PROVIDER_ID = "openai-codex";

export const CODEX_DEFAULT_MODEL = "gpt-6-luna";

const CODEX_UNSERVED_MODEL_IDS: ReadonlySet<string> = new Set([
  "gpt-5.3-codex-spark",
  "gpt-5.5",
]);

export const CODEX_PICKER_HIDDEN_MODEL_IDS: readonly string[] = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
];

export function codexOfferedModelIds(catalogIds: readonly string[]): string[] {
  return catalogIds.filter((id) => !CODEX_UNSERVED_MODEL_IDS.has(id));
}
