import { BASE } from "./houston-prompt-base";
import { INTEGRATIONS } from "./houston-prompt-integrations";
import {
  type MissionGuidance,
  missionsSection,
} from "./houston-prompt-missions";
import { routinesGuidance } from "./houston-prompt-routines";
import { skillsAndMemoryGuidance } from "./houston-prompt-skills";

export function houstonSystemPrompt(opts?: {
  triggers?: boolean;
  missions?: MissionGuidance;
}): string {
  const routines = routinesGuidance(opts?.triggers === true);
  const missions = missionsSection(opts?.missions ?? "full");
  return `${BASE}\n\n---\n\n${skillsAndMemoryGuidance}\n\n---\n\n${routines}\n\n---\n\n${missions}\n\n---\n\n${INTEGRATIONS}`;
}
