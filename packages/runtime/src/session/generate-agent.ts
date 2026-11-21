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
import { modelRuntime } from "../auth/storage";
import { config } from "../config";
import { parseGenerateResult } from "./generate-agent-parse";
import { oneShotText } from "./one-shot";

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

export function generateThinkingLevel(
  model: unknown,
): PiThinkingLevel | undefined {
  const reasons =
    (model as { reasoning?: boolean } | null | undefined)?.reasoning === true;
  return reasons ? DEFAULT_REASONING_EFFORT : undefined;
}

export async function generateAgentInstructions(
  description: string,
  opts: { provider?: string; model?: string } = {},
): Promise<GenerateAgentResponse> {
  const model = resolveGenerateModel(opts.provider, opts.model);
  const raw = await oneShotText({
    cwd: config.workspaceDir,
    model,
    modelRuntime,
    systemPrompt: GENERATE_PROMPT,
    prompt: description,
    thinkingLevel: generateThinkingLevel(model),
  });
  return parseGenerateResult(raw);
}
