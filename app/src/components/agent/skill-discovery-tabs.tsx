import type { Activity } from "@houston/engine-adapter";
import type { CatalogShellTab } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { SkillCustomTab } from "./skill-custom-tab";

/**
 * The Skills surface's Custom tab for {@link CatalogShell}: agent-guided
 * create chats first (HOU-791), with GitHub / From-scratch as secondary paths.
 * Read-only mode passes no create flow, so the shell drops tab chrome.
 */
export function useSkillDiscoveryTabs(opts: {
  showCustom: boolean;
  /** The agent whose Skills surface this is — the Custom tab's Houston
   *  library installs into it, and the cross-agent section excludes it. */
  agent: Agent;
  onAddClick: () => void;
  /** Custom tab (HOU-791): start a new agent-guided create chat. */
  onCreateWithAi: () => void;
  /** Custom tab: an ACTIVE workspace-store skill's row opens the same manage
   *  dialog a "Your skills" strip row opens (ADR 0003). */
  onManageSkill?: (slug: string) => void;
  /** Custom tab: unclaimed create-chats, shown as resumable rows. */
  drafts: Activity[];
  onResumeDraft: (activityId: string) => void;
  onDiscardDraft: (activityId: string) => void;
  installedSkillNames?: Set<string>;
}): CatalogShellTab[] {
  const { t } = useTranslation("skills");
  return [
    ...(opts.showCustom
      ? [
          {
            value: "custom",
            label: t("tabs.custom"),
            content: (
              <SkillCustomTab
                agent={opts.agent}
                drafts={opts.drafts}
                onResumeDraft={opts.onResumeDraft}
                onDiscardDraft={opts.onDiscardDraft}
                onCreateWithAi={opts.onCreateWithAi}
                onAddClick={opts.onAddClick}
                onManageSkill={opts.onManageSkill}
                installedSkillNames={opts.installedSkillNames}
              />
            ),
          },
        ]
      : []),
  ];
}
