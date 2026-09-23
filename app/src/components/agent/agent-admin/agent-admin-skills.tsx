import type { AgentSectionProps } from "../../agent-settings/agent-settings-nav.ts";
import { SkillsBody } from "../../skills-view";

/**
 * Skills section: the SAME surface as the workspace Skills library, scoped to
 * this AI Employee — one list of the skills it has, the same search and its
 * own "Create skill" menu, and a row opening that skill's full-page editor in
 * place of the list with its chat beside it.
 *
 * The section carries no title of its own: the settings rail names the place
 * the user just opened, so the body starts at its tools row. The editor takes
 * the section over in place, and its own back arrow is the one way back.
 */
export function AgentAdminSkills({ agent }: AgentSectionProps) {
  return <SkillsBody agent={agent} />;
}
