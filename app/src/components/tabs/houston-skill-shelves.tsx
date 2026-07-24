import {
  Button,
  CatalogAddButton,
  CatalogGrid,
  CatalogRow,
  CatalogSectionHeader,
  CatalogShowMore,
  Skeleton,
} from "@houston-ai/core";
import { Check } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { HoustonLibrarySkill } from "../../lib/houston-skill-library";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import { SkillIcon } from "../skill-icon";
import type { HoustonLibraryGroup } from "./use-houston-skill-library";

/** Rows shown per agent shelf at rest; "Show all" reveals the rest. */
const SHELF_CAP = 4;

interface Props {
  groups: HoustonLibraryGroup[];
  loading: boolean;
  failed: boolean;
  retry: () => void;
  install: (skill: HoustonLibrarySkill) => void;
  /** Slug currently installing (drives that row's spinner), or null. */
  installing: string | null;
  /** Already-installed slugs — their rows show a quiet check, not an add. */
  installedSkillNames?: Set<string>;
}

/**
 * The Houston skill library shelves (Custom tab): one shelf per pre-set
 * agent, each a capped grid of installable skill rows in the shared catalog
 * grammar — the skill's own icon, title, one-line description, and the round
 * add button that becomes a quiet check once the skill is in "Your skills".
 */
export function HoustonSkillShelves({
  groups,
  loading,
  failed,
  retry,
  install,
  installing,
  installedSkillNames,
}: Props) {
  const { t } = useTranslation("skills");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  if (loading) {
    return (
      <div
        role="status"
        className="flex flex-col gap-2"
        aria-label={t("library.loading")}
      >
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (failed) {
    return (
      <div className="flex items-center gap-3">
        <p className="text-sm text-ink-muted">{t("library.loadFailed")}</p>
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          {t("library.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => {
        const open = expanded.has(group.agentId);
        const visible = open ? group.skills : group.skills.slice(0, SHELF_CAP);
        return (
          <section key={group.agentId} className="flex flex-col gap-2">
            <CatalogSectionHeader
              title={group.agentName}
              count={group.skills.length}
            />
            <CatalogGrid>
              {visible.map((skill) => {
                const name = skillDisplayTitle({
                  name: skill.slug,
                  title: skill.title,
                });
                const installed = installedSkillNames?.has(skill.slug);
                return (
                  <CatalogRow
                    key={skill.slug}
                    // The row body is the same install target as the + —
                    // one row, one action; an installed row is inert.
                    onClick={
                      installed || installing !== null
                        ? undefined
                        : () => install(skill)
                    }
                    icon={
                      <SkillIcon
                        image={skill.image}
                        bubbleClassName="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-line-input"
                      />
                    }
                    title={name}
                    description={skill.description || undefined}
                    action={
                      installed ? (
                        <span
                          role="img"
                          className="flex size-7 shrink-0 items-center justify-center text-ink-muted"
                          aria-label={t("library.installedLabel")}
                          title={t("library.installedLabel")}
                        >
                          <Check className="size-4" />
                        </span>
                      ) : (
                        <CatalogAddButton
                          label={t("library.installLabel", { name })}
                          busy={installing === skill.slug}
                          disabled={installing !== null}
                          onClick={() => install(skill)}
                        />
                      )
                    }
                  />
                );
              })}
            </CatalogGrid>
            {!open && group.skills.length > SHELF_CAP && (
              <CatalogShowMore
                onClick={() =>
                  setExpanded((prev) => new Set(prev).add(group.agentId))
                }
              >
                {t("grid.showAllSkills", { count: group.skills.length })}
              </CatalogShowMore>
            )}
          </section>
        );
      })}
    </div>
  );
}
