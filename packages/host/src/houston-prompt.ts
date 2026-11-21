import { BASE } from "./houston-prompt-base";
import { INTEGRATIONS } from "./houston-prompt-integrations";
import { missionsGuidance } from "./houston-prompt-missions";
import { routinesGuidance } from "./houston-prompt-routines";
import { skillsAndMemoryGuidance } from "./houston-prompt-skills";

export function houstonSystemPrompt(opts?: { triggers?: boolean }): string {
  const routines = routinesGuidance(opts?.triggers === true);
  return `${BASE}\n\n---\n\n${skillsAndMemoryGuidance}\n\n---\n\n${routines}\n\n---\n\n${missionsGuidance}\n\n---\n\n${INTEGRATIONS}`;
}
