import {
  type AgentSkill,
  parseSkillFrontmatter,
} from "@houston/agentstore-contract";
import { Card } from "@houston-ai/core";
import { Wrench } from "lucide-react";

/** Fall back to a humanized slug when a skill omits its frontmatter title. */
function displayTitle(slug: string, title: string | null): string {
  if (title?.trim()) return title.trim();
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function SkillList({ skills }: { skills: AgentSkill[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {skills.map((skill) => {
        const fm = parseSkillFrontmatter(skill.body);
        return (
          <li key={skill.slug}>
            <Card className="h-full gap-3 py-5">
              <div className="flex items-start gap-3 px-5">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <Wrench aria-hidden className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium">
                    {displayTitle(skill.slug, fm.title)}
                  </p>
                  {fm.description && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {fm.description}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
