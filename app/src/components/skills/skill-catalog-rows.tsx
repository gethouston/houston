import { CatalogGrid, CatalogRow } from "@houston-ai/core";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import type { SkillSummary } from "../../lib/types";
import { SkillIcon } from "../skill-icon";
import { skillIntegrationChips } from "../skill-integration-chips";

interface SkillCatalogRowProps {
  skill: SkillSummary;
  onOpen: (skill: SkillSummary) => void;
  trailing?: ReactNode;
}

/** The installed-skill catalog grammar shared by the Skills surfaces and the
 *  mission-picker dialog. */
export function SkillCatalogRow({
  skill,
  onOpen,
  trailing,
}: SkillCatalogRowProps) {
  return (
    <CatalogRow
      icon={
        <SkillIcon
          image={skill.image}
          bubbleClassName="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-line-input"
        />
      }
      title={skillDisplayTitle(skill)}
      description={skill.description || undefined}
      trailing={
        <div className="flex shrink-0 items-center gap-2">
          {trailing}
          {skillIntegrationChips(skill.integrations, 3)}
          <ChevronRight
            aria-hidden
            className="size-4 shrink-0 text-ink-muted"
          />
        </div>
      }
      onClick={() => onOpen(skill)}
    />
  );
}

interface SkillCatalogGridProps {
  skills: readonly SkillSummary[];
  onOpen: (skill: SkillSummary) => void;
  trailing?: (skill: SkillSummary) => ReactNode;
  columns?: 1 | "responsive";
}

/** A skill-row list shared by the Skills surfaces and the mission-picker dialog. */
export function SkillCatalogGrid({
  skills,
  onOpen,
  trailing,
  columns = "responsive",
}: SkillCatalogGridProps) {
  return (
    <CatalogGrid columns={columns === 1 ? 1 : "auto"}>
      {skills.map((skill) => (
        <SkillCatalogRow
          key={skill.name}
          skill={skill}
          onOpen={onOpen}
          trailing={trailing?.(skill)}
        />
      ))}
    </CatalogGrid>
  );
}
