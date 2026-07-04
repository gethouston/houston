import { resolveModel } from "../ai/providers";
import { authStorage, modelRegistry } from "../auth/storage";
import { config } from "../config";
import { runOneShot } from "./oneshot";
import { buildRoutine, type SuggestedRoutine } from "./suggested-routine";

/**
 * AI-assisted agent instruction generator: one tool-less pi prompt that turns
 * a user-supplied agent description into CLAUDE.md content, a short name,
 * suggested Composio toolkits, and (optionally) one suggested routine with an
 * engine-built cron. Port of the Rust engine's `generate_instructions.rs`.
 * Failures THROW so the caller can show a toast — no silent fallback:
 * instruction generation is user-initiated work (see "No silent failures").
 */

const GENERATE_TIMEOUT_MS = 60_000;

export interface GenerateInstructionsResult {
  name: string;
  instructions: string;
  /** Composio toolkit slugs (e.g. "GMAIL"); display names are the client's job. */
  suggestedIntegrations: string[];
  suggestedRoutine: SuggestedRoutine | null;
}

/**
 * All static instructions live in the SYSTEM prompt; the user's description is
 * sent as the user message, so quotes/newlines in it can't break out of the
 * prompt context and inject instructions (the Rust port JSON-escaped instead —
 * same property, cleaner mechanism).
 */
const GENERATION_PROMPT = `You are an expert at writing AI agent job descriptions (CLAUDE.md files).

The user message is a description of an AI agent. Generate a CLAUDE.md job description for it.

The job description should:
- Start with a clear role definition (what the agent is and does)
- Include specific responsibilities and capabilities
- Include behavioral guidelines and constraints
- Be written in second person ("You are...", "You will...", "Your role...")
- Be practical, specific, and actionable
- Be between 200-500 words
- Use markdown headers and bullet points for clarity

Also suggest:
- A short agent name (2-4 words, title case, no generic words like "Agent" or "Assistant" unless truly fitting, e.g. "Email Inbox Manager", "Quant Analyst", "Sales Pipeline Bot")
- 0-4 relevant Composio integrations (toolkit names) that this agent would genuinely benefit from. Use an empty array if no external service integration is needed.
Common toolkits: GMAIL, GOOGLECALENDAR, GOOGLESHEETS, GOOGLEDOCS, SLACK, NOTION, GITHUB, JIRA, TRELLO, ASANA, HUBSPOT, SALESFORCE, SHOPIFY, STRIPE, TWITTER, LINKEDIN, DISCORD, AIRTABLE, EXCEL, GOOGLEDRIVE
- Optionally, exactly ONE routine, but ONLY if the agent's job clearly involves a recurring scheduled task (e.g. a daily inbox digest, a weekly report). If the agent is reactive / on-demand / one-off, set suggestedRoutine to null. Do not invent a schedule just to fill the field.
  Allowed scheduleType values ONLY: "daily", "weekdays", "weekly". Give timeOfDay as 24h "HH:MM". For "weekly" also give dayOfWeek (0=Sunday .. 6=Saturday). Keep the routine prompt to one sentence describing what it should do each run.

Return ONLY valid JSON (no markdown fences):
{"name": "...", "instructions": "...", "suggestedIntegrations": ["TOOLKIT1", "TOOLKIT2"], "suggestedRoutine": {"name": "...", "prompt": "...", "scheduleType": "daily", "timeOfDay": "08:00", "dayOfWeek": 1}}
Set "suggestedRoutine" to null when no recurring schedule is appropriate.`;

/** Parse the model's raw reply, tolerating markdown fences. Throws on garbage. */
export function parseGenerateResult(raw: string): GenerateInstructionsResult {
  const cleaned = raw
    .trim()
    .replace(/^```json/, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

  let v: Record<string, unknown>;
  try {
    v = JSON.parse(cleaned) as Record<string, unknown>;
  } catch (e) {
    throw new Error(
      `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const instructions = v.instructions;
  if (typeof instructions !== "string")
    throw new Error("missing 'instructions' field in response");

  const name = typeof v.name === "string" ? v.name : "";
  const suggestedIntegrations = Array.isArray(v.suggestedIntegrations)
    ? v.suggestedIntegrations.filter((s): s is string => typeof s === "string")
    : [];

  return {
    name,
    instructions,
    suggestedIntegrations,
    suggestedRoutine: buildRoutine(v.suggestedRoutine),
  };
}

/**
 * Generate instructions with the workspace's active provider/model (or an
 * explicit model pin). Throws on no provider, timeout, or unparseable output.
 */
export async function generateInstructions(
  description: string,
  model?: string,
): Promise<GenerateInstructionsResult> {
  const raw = await runOneShot({
    cwd: config.workspaceDir,
    model: resolveModel(model),
    authStorage,
    modelRegistry,
    systemPrompt: GENERATION_PROMPT,
    prompt: description,
    timeoutMs: GENERATE_TIMEOUT_MS,
  });
  return parseGenerateResult(raw);
}
