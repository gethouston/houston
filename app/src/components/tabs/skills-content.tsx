import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AddSkillDialog } from "@houston-ai/skills";
import {
  Button,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Spinner,
} from "@houston-ai/core";
import { Plus } from "lucide-react";
import { SkillCard } from "../skill-card";
import type { SkillSummary } from "../../lib/types";
import { humanizeSkillName } from "../../lib/humanize-skill-name";
import { useSkillDialogLabels } from "./use-skill-surface-labels";

export function SkillsContent({
  skills,
  loading,
  onSkillClick,
  onCreateFromScratch,
  installedSkillNames,
}: {
  skills: SkillSummary[];
  loading: boolean;
  onSkillClick: (name: string) => void;
  onCreateFromScratch?: (input: {
    name: string;
    description: string;
    content: string;
  }) => Promise<string>;
  installedSkillNames?: Set<string>;
}) {
  const { t } = useTranslation("skills");
  const addDialogLabels = useSkillDialogLabels();
  const [dialogOpen, setDialogOpen] = useState(false);
  const sorted = useMemo(
    () => [...skills].sort((a, b) => a.name.localeCompare(b.name)),
    [skills],
  );
  const addDialogProps = onCreateFromScratch
    ? {
        onCreateFromScratch,
        installedSkillNames,
      }
    : null;

  if (loading && sorted.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-3.5" />
        {t("grid.loading")}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <>
        <div className="mx-auto max-w-md flex flex-col items-center gap-6 text-center pt-24 px-6">
          <EmptyHeader>
            <EmptyTitle>{t("grid.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("grid.emptyDescription")}</EmptyDescription>
          </EmptyHeader>
          {addDialogProps && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              {t("grid.addSkill")}
            </Button>
          )}
        </div>
        {addDialogProps && (
          <AddSkillDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            {...addDialogProps}
            labels={addDialogLabels}
          />
        )}
      </>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <p className="text-xs text-muted-foreground max-w-md">
          {t("grid.descriptionShort")}
        </p>
        {addDialogProps && (
          <Button size="sm" onClick={() => setDialogOpen(true)} className="shrink-0">
            <Plus className="size-3.5" />
            {t("grid.addSkill")}
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {sorted.map((skill) => (
          <SkillCard
            key={skill.name}
            image={skill.image}
            title={humanizeSkillName(skill.name)}
            description={skill.description}
            onClick={() => onSkillClick(skill.name)}
          />
        ))}
      </div>
      {addDialogProps && (
        <AddSkillDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          {...addDialogProps}
          labels={addDialogLabels}
        />
      )}
    </div>
  );
}
