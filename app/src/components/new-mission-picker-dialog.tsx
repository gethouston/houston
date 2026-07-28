import {
  CatalogSearchField,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@houston-ai/core";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSkills } from "../hooks/queries";
import {
  filterInstalledSkills,
  sortSkillsByTitle,
} from "../lib/installed-preview";
import type { Agent } from "../lib/types";
import { SkillCatalogGrid } from "./skills/skill-catalog-rows";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lockedAgent: Agent;
  onSkill: (skillName: string) => void;
}

/** The chat's installed-skill picker, using the same catalog rows as Skills. */
export function NewMissionPickerDialog({
  open,
  onOpenChange,
  lockedAgent,
  onSkill,
}: Props) {
  const { i18n, t } = useTranslation(["dashboard", "skills"]);
  const [query, setQuery] = useState("");
  const { data: skills, isLoading: skillsLoading } = useSkills(
    lockedAgent.folderPath,
  );
  const sorted = useMemo(
    () => sortSkillsByTitle(skills ?? [], i18n.language),
    [i18n.language, skills],
  );
  const { filtered } = filterInstalledSkills(sorted, query);

  const handleSkill = (name: string) => {
    onSkill(name);
    onOpenChange(false);
  };

  useEffect(() => {
    if (open && lockedAgent.folderPath) setQuery("");
  }, [lockedAgent.folderPath, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle>{t("dashboard:skillPicker.title")}</DialogTitle>
          <DialogDescription>
            {t("dashboard:skillPicker.descriptionWithAgent", {
              name: lockedAgent.name,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 px-6 pb-3">
          <CatalogSearchField
            value={query}
            onChange={setQuery}
            label={t("skills:grid.searchSkills")}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {skillsLoading ? (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Spinner className="size-3.5" />
              {t("dashboard:skillPicker.skillsLoading")}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-[13px] text-ink-muted">
              {skills?.length
                ? t("skills:grid.noMatchingSkills")
                : t("dashboard:skillPicker.empty")}
            </p>
          ) : (
            <SkillCatalogGrid
              skills={filtered}
              onOpen={(skill) => handleSkill(skill.name)}
              columns={1}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
