import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@houston-ai/core";
import { useSkills } from "../hooks/queries";
import { SkillCard } from "./skill-card";
import { SkillList } from "./new-mission-picker-skill-list";
import {
  buildSkillPickerTabs,
  FEATURED_SKILLS_TAB_ID,
  OTHER_SKILLS_TAB_ID,
  resolveActiveSkillPickerTab,
  shouldShowSkillPickerTabs,
} from "./new-mission-picker-tab-model";
import { ScrollableTabs } from "./new-mission-picker-tabs";
import type { Agent, SkillSummary } from "../lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * When set, the dialog is locked to this agent and the agent selector is
   * hidden (per-agent board button). When omitted, the dialog exposes an
   * agent picker (Mission Control).
   */
  lockedAgent?: Agent;
  agents?: Agent[];
  onBlank?: (agentPath: string | undefined) => void;
  onSkill: (agentPath: string, skillName: string) => void;
  /** Hide the "Blank conversation" card in the skill-only picker. */
  hideBlank?: boolean;
}

export function NewMissionPickerDialog({
  open,
  onOpenChange,
  lockedAgent,
  agents = [],
  onBlank,
  onSkill,
  hideBlank = false,
}: Props) {
  const { t } = useTranslation("dashboard");

  const [pickedAgentPath, setPickedAgentPath] = useState<string>("");
  const activeAgentPath = lockedAgent
    ? lockedAgent.folderPath
    : pickedAgentPath || (agents.length === 1 ? agents[0].folderPath : "");

  const { data: skills, isLoading: skillsLoading } = useSkills(
    activeAgentPath || undefined,
  );

  const { categoryNames, byCategory, featured } = useMemo(() => {
    const byCategory = new Map<string, SkillSummary[]>();
    const featured: SkillSummary[] = [];
    for (const s of skills ?? []) {
      if (s.featured) featured.push(s);
      const cat = s.category?.trim() || OTHER_SKILLS_TAB_ID;
      const list = byCategory.get(cat) ?? [];
      list.push(s);
      byCategory.set(cat, list);
    }
    const names = Array.from(byCategory.keys())
      .filter((c) => c !== OTHER_SKILLS_TAB_ID)
      .sort((a, b) => a.localeCompare(b));
    return { categoryNames: names, byCategory, featured };
  }, [skills]);

  const hasOther = byCategory.has(OTHER_SKILLS_TAB_ID);
  const hasFeatured = featured.length > 0;

  const tabs = useMemo(
    () =>
      buildSkillPickerTabs({
        categoryNames,
        hasFeatured,
        hasOther,
        featuredLabel: t("skillPicker.featuredTab"),
        otherLabel: t("skillPicker.otherTab"),
      }),
    [categoryNames, hasFeatured, hasOther, t],
  );

  const [activeTab, setActiveTab] = useState<string>("");
  const firstTabId = tabs[0]?.id ?? "";
  const activeTabId = resolveActiveSkillPickerTab(tabs, activeTab);

  useEffect(() => {
    if (open) setActiveTab(firstTabId);
  }, [open, activeAgentPath, firstTabId]);

  const skillsForActiveTab: SkillSummary[] =
    activeTabId === FEATURED_SKILLS_TAB_ID
      ? featured
      : (byCategory.get(activeTabId) ?? []);

  const sortedSkills = useMemo(
    () => [...skillsForActiveTab].sort((a, b) => a.name.localeCompare(b.name)),
    [skillsForActiveTab],
  );

  const showBlankCard =
    !hideBlank && (tabs.length === 0 || activeTabId === firstTabId);

  const handleBlank = () => {
    if (!onBlank) return;
    if (lockedAgent && !activeAgentPath) return;
    onBlank(activeAgentPath || undefined);
    onOpenChange(false);
  };

  const handleSkill = (name: string) => {
    if (!activeAgentPath) return;
    onSkill(activeAgentPath, name);
    onOpenChange(false);
  };

  const needsAgent = !activeAgentPath;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle>{t("skillPicker.title")}</DialogTitle>
          <DialogDescription>
            {lockedAgent
              ? t("skillPicker.descriptionWithAgent", {
                  name: lockedAgent.name,
                })
              : t("skillPicker.description")}
          </DialogDescription>
        </DialogHeader>

        {!lockedAgent && agents.length > 1 && (
          <div className="shrink-0 px-6 pb-3">
            <label
              htmlFor="nmp-agent"
              className="text-sm font-medium block mb-1.5"
            >
              {t("skillPicker.agentLabel")}
            </label>
            <select
              id="nmp-agent"
              value={pickedAgentPath}
              onChange={(e) => setPickedAgentPath(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">{t("skillPicker.agentPlaceholder")}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.folderPath}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {shouldShowSkillPickerTabs(tabs) && (
          <ScrollableTabs
            tabs={tabs}
            activeTab={activeTabId}
            onTabChange={setActiveTab}
            scrollLeftLabel={t("skillPicker.scrollTabsLeft")}
            scrollRightLabel={t("skillPicker.scrollTabsRight")}
          />
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
          <div className="flex flex-col gap-2">
            {showBlankCard && (
              <SkillCard
                image="speech-balloon"
                title={t("skillPicker.blank")}
                description={t("skillPicker.blankDescription")}
                onClick={handleBlank}
                disabled={!!lockedAgent && needsAgent}
              />
            )}

            <SkillList
              agentReady={!needsAgent}
              loading={skillsLoading}
              skills={sortedSkills}
              emptyLabel={
                activeTabId
                  ? t("skillPicker.skillsEmpty")
                  : t("skillPicker.empty")
              }
              pickAgentLabel={t("skillPicker.pickAgentFirst")}
              loadingLabel={t("skillPicker.skillsLoading")}
              hideEmpty={showBlankCard && sortedSkills.length === 0}
              onSkill={handleSkill}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
