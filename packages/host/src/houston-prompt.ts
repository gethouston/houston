/**
 * The Houston product system prompt: the authoritative identity + how-to copy
 * for the Houston agent. Every section has a byte-identical desktop twin in
 * app/src-tauri/src/houston_prompt/ (houston-prompt-mirrors.test.ts).
 *
 * This prompt is re-sent on every model request, so it carries only what must
 * hold before any tool runs; tool mechanics live in the tool descriptions and
 * results (houston-prompt-budget.test.ts caps its size).
 *
 * This is PRODUCT content. The host stays prompt-agnostic: it merely injects
 * this into the runtime via HOUSTON_SYSTEM_PROMPT. The real desktop app may
 * override it (HOUSTON_APP_SYSTEM_PROMPT); this is the built-in default so the
 * agent knows how to create Skills/Routines/learnings out of the box.
 */

import { BASE } from "./houston-prompt-base";
import { INTEGRATIONS } from "./houston-prompt-integrations";
import { missionsGuidance } from "./houston-prompt-missions";
import { routinesGuidance } from "./houston-prompt-routines";
import { skillsAndMemoryGuidance } from "./houston-prompt-skills";

/**
 * The composite Houston product prompt (base + skills/memory + routines +
 * integrations). `triggers` = can an external app event wake a routine here
 * (Houston Cloud only); false (the default, serving desktop/self-host) makes the
 * Routines section describe schedule wakes only, so the agent never offers an
 * event wake it cannot fire.
 */
export function houstonSystemPrompt(opts?: { triggers?: boolean }): string {
  const routines = routinesGuidance(opts?.triggers === true);
  return `${BASE}\n\n---\n\n${skillsAndMemoryGuidance}\n\n---\n\n${routines}\n\n---\n\n${missionsGuidance}\n\n---\n\n${INTEGRATIONS}`;
}
