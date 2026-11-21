"use client";

import type { AgentSkill } from "@houston/agentstore-contract";
import { SkillList as StoreSkillList } from "@houston-ai/store";
import { Markdown } from "@/components/markdown";

export function SkillList({ skills }: { skills: AgentSkill[] }) {
  return (
    <StoreSkillList
      skills={skills}
      renderContent={(content) => <Markdown content={content} />}
    />
  );
}
