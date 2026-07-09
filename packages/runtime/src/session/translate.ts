import { activeProvider, resolveModel } from "../ai/providers";
import { authStorage, modelRegistry } from "../auth/storage";
import { oneShotWithClaude } from "../backends/claude/one-shot";
import { readAnthropicToken } from "../backends/claude/read-token";
import { config } from "../config";
import { oneShotText } from "./one-shot";
import {
  parseTranslateResult,
  type TranslateItemInput,
  type TranslateItemResult,
} from "./translate-parse";

/**
 * AI translation for installed skills (HOU-733): the host splits a SKILL.md
 * into its human-language surfaces (title, description, body) and sends the
 * texts here — the runtime is where the provider credential lives. The model
 * translates content only; identity and bookkeeping never travel, the host
 * reassembles the frontmatter deterministically.
 *
 * Failures THROW so the route answers 400 with the real reason — the user
 * asked for this translation, no silent fallback (beta no-silent-failure).
 *
 * COMPLIANCE GATE: like titles (`session/summarize.ts` dispatchTitle) and the
 * anonymize pass, when the active provider is `anthropic` the one-shot runs
 * through the Claude Agent SDK — never pi's in-process Anthropic client.
 */

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Latin-American Spanish",
  pt: "Brazilian Portuguese",
};

export function translatePrompt(targetLanguage: string): string {
  const name =
    LANGUAGE_NAMES[targetLanguage] ??
    `the '${targetLanguage}' language (BCP-47)`;
  return `You translate the content of an AI assistant's skill file (markdown with optional metadata strings) into ${name}.

The user sends JSON: {"items":[{"id":"...","text":"..."}]}. Translate each item's text into ${name}.

Rules:
- Preserve markdown structure exactly: headers, lists, tables, links, emphasis, blank lines.
- NEVER translate: fenced code blocks, inline code, URLs, file paths, email addresses, CLI commands, tool or product names, kebab-case identifiers (like research-company), and placeholder tokens such as {{name}} or <email>. Copy them verbatim.
- Translate naturally and idiomatically; do not add, remove, shorten, or reorder content.
- If an item is already written in ${name}, return it unchanged.

Return ONLY valid JSON (no markdown fences), with every input id exactly once:
{"items":[{"id":"...","text":"..."}]}`;
}

/**
 * Translate the given texts with the active provider's model. Empty input
 * skips the model call entirely.
 */
export async function translateTexts(
  items: TranslateItemInput[],
  targetLanguage: string,
): Promise<TranslateItemResult[]> {
  if (items.length === 0) return [];
  const systemPrompt = translatePrompt(targetLanguage);
  const prompt = JSON.stringify({ items });
  const raw =
    activeProvider() === "anthropic"
      ? await oneShotWithClaude({
          prompt,
          systemPrompt,
          workspaceDir: config.workspaceDir,
          readToken: () => readAnthropicToken(authStorage),
          modelId: resolveModel().id,
        })
      : await oneShotText({
          cwd: config.workspaceDir,
          model: resolveModel(),
          authStorage,
          modelRegistry,
          systemPrompt,
          prompt,
        });
  return parseTranslateResult(raw, items);
}
