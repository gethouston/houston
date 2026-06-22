import { Spinner } from "@houston-ai/core";
import { humanizeSkillName } from "../lib/humanize-skill-name";
import type { SkillSummary } from "../lib/types";
import { SkillCard } from "./skill-card";

export function SkillList({
  agentReady,
  loading,
  skills,
  emptyLabel,
  pickAgentLabel,
  loadingLabel,
  hideEmpty,
  onSkill,
}: {
  agentReady: boolean;
  loading: boolean;
  skills: SkillSummary[];
  emptyLabel: string;
  pickAgentLabel: string;
  loadingLabel: string;
  hideEmpty?: boolean;
  onSkill: (name: string) => void;
}) {
  if (!agentReady) {
    return <p className="text-sm text-muted-foreground">{pickAgentLabel}</p>;
  }
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-3.5" />
        {loadingLabel}
      </div>
    );
  }
  if (skills.length === 0) {
    if (hideEmpty) return null;
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <>
      {skills.map((s) => (
        <SkillCard
          key={s.name}
          image={s.image}
          title={humanizeSkillName(s.name)}
          description={s.description}
          onClick={() => onSkill(s.name)}
        />
      ))}
    </>
  );
}
