import type { TabProps } from "../../lib/types";
import { AgentAdminSkills } from "./agent-admin/agent-admin-skills";

/**
 * The Skills tab (PRODUCT-1256): the catalog-grammar Skills surface, promoted
 * from a row inside the old Settings tab to a tab of its own — no nav rail,
 * just the surface. Manager-only (the tab is hidden from everyone else), so
 * it is always editable.
 */
export default function SkillsTab({ agent }: TabProps) {
  return (
    <div className="flex flex-1 min-h-0 min-w-0 flex-col overflow-y-auto">
      <AgentAdminSkills agent={agent} />
    </div>
  );
}
