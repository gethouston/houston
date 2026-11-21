import type { AgentSectionProps } from "../../agent-settings/agent-settings-nav.ts";
import { SkillsBody } from "../../skills-view";

export function AgentAdminSkills({ agent }: AgentSectionProps) {
  return <SkillsBody agent={agent} />;
}
