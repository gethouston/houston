import { AsyncButton } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { AgentSelectList } from "./agent-select-list";

/**
 * The manage dialog's "Agents with this skill" section (presentational; the
 * dialog body owns the draft selection). Two modes:
 * - `"editable"` — the toggle list (the global page's assignment).
 * - `"locked"` — holders read-only + a share hint: shared-store deployments
 *   never offer copy fan-out on a LOCAL row; multi-agent use goes through
 *   "Share to workspace" (ADR 0003).
 * The per-agent dialog renders no section at all (`assignment: "hidden"`).
 */
export function SkillAssignmentSection({
  mode,
  agents,
  assignedIds,
  selected,
  onToggle,
  allowEmptySelection,
  onEnableAll,
  overrides,
}: {
  mode: "editable" | "locked";
  agents: Agent[];
  /** Ids of the agents currently holding/enabled on the skill. */
  assignedIds: ReadonlySet<string>;
  /** The draft selection (owned by the dialog body). */
  selected: ReadonlySet<string>;
  onToggle: (agent: Agent) => void;
  allowEmptySelection: boolean;
  /** One click enables every agent (store-backed rows only); the caller also
   *  updates the draft selection. */
  onEnableAll?: () => Promise<void>;
  /** Agents whose own modified copy shadows the workspace version. */
  overrides?: { agents: Agent[]; onRevert: (agent: Agent) => Promise<void> };
}) {
  const { t } = useTranslation("skills");

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">
          {t("global.manage.agentsLabel")}
        </span>
        {onEnableAll && (
          <AsyncButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEnableAll}
          >
            {t("global.manage.enableAll")}
          </AsyncButton>
        )}
      </div>
      {mode === "locked" ? (
        <>
          <AgentSelectList
            agents={agents.filter((a) => assignedIds.has(a.id))}
            selected={selected}
            onToggle={() => {}}
            lockedIds={assignedIds}
            lockedNote={t("global.manage.hasSkillNote")}
          />
          <p className="text-xs text-ink-muted">
            {t("global.manage.shareToManage")}
          </p>
        </>
      ) : (
        <>
          <AgentSelectList
            agents={agents}
            selected={selected}
            onToggle={onToggle}
          />
          {selected.size === 0 && !allowEmptySelection && (
            <p className="text-xs text-ink-muted">
              {t("global.manage.keepOneAgent")}
            </p>
          )}
        </>
      )}
      {overrides && overrides.agents.length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          {overrides.agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center justify-between gap-2 text-xs text-ink-muted"
            >
              <span>{t("global.manage.modifiedOn", { name: agent.name })}</span>
              <AsyncButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => overrides.onRevert(agent)}
              >
                {t("global.manage.revert")}
              </AsyncButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
