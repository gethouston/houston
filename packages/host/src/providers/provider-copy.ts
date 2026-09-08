import { providerName } from "./lookup";

/**
 * The sentences that NAME a provider to a person.
 *
 * Houston's users are non-technical, and pi's canonical ids ("openai-codex")
 * are internal vocabulary: a routine that refuses to fire must say "ChatGPT /
 * Codex", never the wire id. Every user-visible provider token in the host
 * routes through here, so the catalog stays the ONE source of provider names
 * and no caller invents a second spelling.
 */

/**
 * The provider name for a SENTENCE. The catalog names carry a plan
 * parenthetical ("Claude (Pro / Max)") which reads wrong mid-sentence, so it
 * is dropped here and only here — the catalog stays the source of truth for
 * every place a provider is NAMED rather than narrated. A provider the catalog
 * doesn't carry keeps its own id: a bare id beats an empty sentence.
 */
export function sentenceProviderName(id: string): string {
  return providerName(id).replace(/\s*\(.*\)\s*$/, "");
}

/**
 * A routine pinned to a provider this deployment cannot fire. Both firers (the
 * schedule one and the trigger one) throw it, and the run is recorded errored
 * with this exact text — so the run history reads as one sentence, not two.
 */
export function routineProviderUnavailable(id: string): string {
  return `This routine runs on ${sentenceProviderName(id)}, which is not available here. Open the routine and pick another provider.`;
}

/** A cloud turn pinned to a provider the cloud per-turn runtime cannot serve. */
export function cloudProviderUnavailable(id: string): string {
  return `${sentenceProviderName(id)} is not available for cloud agents. Open the routine and pick another provider.`;
}
