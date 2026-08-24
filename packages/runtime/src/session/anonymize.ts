import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { activeProvider, resolveModel } from "../ai/providers";
import { authStorage, modelRuntime } from "../auth/storage";
import { oneShotWithClaude } from "../backends/claude/one-shot";
import { readAnthropicToken } from "../backends/claude/read-token";
import { config } from "../config";
import {
  type AnonymizeItemInput,
  type AnonymizeItemResult,
  parseAnonymizeResult,
} from "./anonymize-parse";
import { oneShotText } from "./one-shot";

/**
 * AI anonymization for portable-agent exports (HOU-727): the LLM v2 pass the
 * heuristic redactor (`@houston/domain` anonymize.ts) always anticipated. The
 * host gathers the selected content, runs the regex pre-pass, and sends the
 * texts here — so the model only sees pre-redacted content and catches what
 * patterns can't (names, employers, addresses, project-identifying detail).
 *
 * Failures THROW so the route answers 400 with the real reason — the host
 * falls back to the regex-only result and surfaces why (beta
 * no-silent-failure).
 *
 * COMPLIANCE GATE: like titles (`session/summarize.ts` dispatchTitle), when
 * the active provider is `anthropic` the one-shot runs through the Claude
 * Agent SDK — never pi's in-process Anthropic client.
 */

const ANONYMIZE_PROMPT = `You redact personal and sensitive information from text so it can be shared publicly.

The user sends JSON: {"items":[{"id":"...","text":"..."}]}. The texts belong to an AI assistant's configuration (instructions, skills, routines, learnings) that its owner wants to share with someone else.

For each item, return the same text with every span that identifies the owner, their contacts, or their organization replaced by a placeholder token:
- people's names -> <name>
- email addresses -> <email>
- phone numbers -> <phone>
- physical addresses -> <address>
- company, employer, team, or client names -> <company>
- usernames and social handles -> <handle>
- URLs pointing at a person's or organization's own resources -> <url>
- usernames inside filesystem paths -> <user>
- API keys, tokens, passwords -> <secret>
- any other identifying detail (birthdays, account or document numbers, ...) -> <redacted>

Rules:
- Texts may already contain placeholder tokens like <email> or <user> from an earlier pass. Leave those untouched.
- Change NOTHING else: keep wording, formatting, markdown, and whitespace identical outside the replaced spans. Never shorten, rewrite, or improve the text.
- Names of public products, programming languages, and widely known tools are NOT sensitive.
- For each item also write a short summary (under 12 words) of what you redacted, e.g. "redacted 2 names and a company". If nothing needed redaction, use exactly: "no personal info detected".

Return ONLY valid JSON (no markdown fences), with every input id exactly once:
{"items":[{"id":"...","text":"...","summary":"..."}]}`;

/**
 * Pure, parameterized redaction pass (the `generateTitle` shape): a one-shot
 * turn over an injected model runtime. Powers the pool worker's anonymize op,
 * which has a hydrated agent root instead of the process-global config —
 * pi providers only; the Claude-SDK path below is pod-only by compliance.
 */
export async function anonymizeTextsWith(
  opts: {
    workspaceDir: string;
    model: unknown;
    modelRuntime: ModelRuntime;
  },
  items: AnonymizeItemInput[],
): Promise<AnonymizeItemResult[]> {
  if (items.length === 0) return [];
  const prompt = JSON.stringify({ items });
  const raw = await oneShotText({
    cwd: opts.workspaceDir,
    model: opts.model,
    modelRuntime: opts.modelRuntime,
    systemPrompt: ANONYMIZE_PROMPT,
    prompt,
  });
  return parseAnonymizeResult(raw, items);
}

/**
 * Redact the given texts with the active provider's model. Empty input skips
 * the model call entirely.
 */
export async function anonymizeTexts(
  items: AnonymizeItemInput[],
): Promise<AnonymizeItemResult[]> {
  if (items.length === 0) return [];
  if (activeProvider() === "anthropic") {
    const raw = await oneShotWithClaude({
      prompt: JSON.stringify({ items }),
      systemPrompt: ANONYMIZE_PROMPT,
      workspaceDir: config.workspaceDir,
      readToken: () => readAnthropicToken(authStorage),
      // Locates the acting member's isolated Claude credential store, so a
      // 401 here can never recover onto the team credential (HOU-976).
      dataDir: config.dataDir,
      modelId: resolveModel().id,
    });
    return parseAnonymizeResult(raw, items);
  }
  return anonymizeTextsWith(
    { workspaceDir: config.workspaceDir, model: resolveModel(), modelRuntime },
    items,
  );
}
