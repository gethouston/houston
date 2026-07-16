import type { GenerateAgentResponse } from "@houston/runtime-client";
import { DEFAULT_REASONING_EFFORT, type PiThinkingLevel } from "../ai/effort";
import {
  buildActiveCustomModel,
  OPENAI_COMPATIBLE,
} from "../ai/openai-compatible";
import {
  listProviders,
  modelFor,
  resolveModel,
  safeGetModel,
} from "../ai/providers";
import { authStorage, modelRegistry } from "../auth/storage";
import { config } from "../config";
import { parseGenerateResult } from "./generate-agent-parse";
import { oneShotText } from "./one-shot";

/**
 * Create-with-AI agent generation (ported from the Rust engine's
 * `generate_instructions.rs`): one throwaway one-shot turn that acts as an AI
 * automation consultant — it reads the user's free-text brief (their role,
 * their work, and the tasks that eat their time) and writes a CLAUDE.md job
 * description, an agent name, suggested Composio toolkits, and an optional
 * routine. Failures THROW so the route surfaces the real reason —
 * user-initiated work, no silent fallback (unlike title summarization, which
 * is cosmetic).
 */

const GENERATE_PROMPT = `You are an expert AI automation consultant.

The user sends a brief describing their role, their work, and the tasks that eat their time. Analyze the brief, identify the highest-leverage work an AI agent could take over for this client, and write that agent's job description (a CLAUDE.md file).

The job description should:
- Start with a clear role definition (what the agent is and does)
- Include specific responsibilities and capabilities, prioritized by impact for this client
- Include behavioral guidelines and constraints
- Be written in second person ("You are...", "You will...", "Your role...")
- Be practical, specific, and actionable
- Be between 200-500 words
- Use markdown headers and bullet points for clarity

Also suggest:
- A short agent name (2-4 words, title case, no generic words like "Agent" or "Assistant" unless truly fitting, e.g. "Email Inbox Manager", "Quant Analyst", "Sales Pipeline Bot")
- 0-4 relevant Composio integrations (toolkit names) that this agent would genuinely benefit from. Use an empty array if no external service integration is needed.
Common toolkits: GMAIL, GOOGLECALENDAR, GOOGLESHEETS, GOOGLEDOCS, SLACK, NOTION, GITHUB, JIRA, TRELLO, ASANA, HUBSPOT, SALESFORCE, SHOPIFY, STRIPE, TWITTER, LINKEDIN, DISCORD, AIRTABLE, EXCEL, GOOGLEDRIVE
- Optionally, exactly ONE routine, but ONLY if a recurring task from the brief clearly warrants automation on a schedule (e.g. a daily inbox digest, a weekly report). If the work is reactive / on-demand / one-off, set suggestedRoutine to null. Do not invent a schedule just to fill the field.
  Allowed scheduleType values ONLY: "daily", "weekdays", "weekly". Give timeOfDay as 24h "HH:MM". For "weekly" also give dayOfWeek (0=Sunday .. 6=Saturday). Keep the routine prompt to one sentence describing what it should do each run.

Return ONLY valid JSON (no markdown fences):
{"name": "...", "instructions": "...", "suggestedIntegrations": ["TOOLKIT1", "TOOLKIT2"], "suggestedRoutine": {"name": "...", "prompt": "...", "scheduleType": "daily", "timeOfDay": "08:00", "dayOfWeek": 1}}
Set "suggestedRoutine" to null when no recurring schedule is appropriate.`;

/**
 * Resolve the pi model for the generation turn. With no provider override this
 * is exactly a chat turn's resolution (`resolveModel`). With one — the UI's
 * brain picker — the provider must be connected (a clear error otherwise, never
 * a silent switch to a different brain), and a stale model id falls back to
 * that provider's default like a saved id would.
 */
export function resolveGenerateModel(provider?: string, model?: string) {
  if (!provider) return resolveModel(model);
  const info = listProviders().find((p) => p.id === provider);
  if (!info) throw new Error(`unknown provider: ${provider}`);
  if (!info.configured)
    throw new Error(
      `${info.name} is not connected. Connect it first, or pick a connected brain.`,
    );
  if (info.id === OPENAI_COMPATIBLE)
    return buildActiveCustomModel(model || undefined);
  return safeGetModel(info.id, model || modelFor(info.id), false);
}

/**
 * The generation turn's reasoning level. The create dialog's picker offers no
 * effort control, so a reasoning-capable model always runs at "medium" (the
 * same default a chat turn applies when the user chose nothing; pi clamps it
 * to the model). Non-reasoning models omit the level entirely.
 */
export function generateThinkingLevel(
  model: unknown,
): PiThinkingLevel | undefined {
  const reasons =
    (model as { reasoning?: boolean } | null | undefined)?.reasoning === true;
  return reasons ? DEFAULT_REASONING_EFFORT : undefined;
}

/**
 * Generate agent instructions from a plain-language description. `provider` /
 * `model` are pi ids (the adapter migrates legacy ids before calling).
 */
export async function generateAgentInstructions(
  description: string,
  opts: { provider?: string; model?: string } = {},
): Promise<GenerateAgentResponse> {
  const model = resolveGenerateModel(opts.provider, opts.model);
  const raw = await oneShotText({
    cwd: config.workspaceDir,
    model,
    authStorage,
    modelRegistry,
    systemPrompt: GENERATE_PROMPT,
    prompt: description,
    thinkingLevel: generateThinkingLevel(model),
  });
  return parseGenerateResult(raw);
}
