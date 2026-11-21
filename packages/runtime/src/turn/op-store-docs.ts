import type { OpResult } from "./op-apply";
import type { ActivityDocOptions } from "./turn-activity-doc";
import type { ActivityDocSource } from "./turn-activity-source";
import type { TurnFilesystem } from "./turn-filesystem";
import { publishLearningsDoc } from "./turn-learnings-doc";
import {
  isSkillsView,
  landedSkillSlugs,
  publishSkillsView,
} from "./turn-skills-doc";
import { docNotLandedReason } from "./turn-view-publish";

export async function publishOpStoreDocs(input: {
  common: Omit<ActivityDocOptions, "family">;
  source: ActivityDocSource;
  filesystem: TurnFilesystem;
  result: OpResult;
  landed: readonly string[];
  learnings: boolean;
}): Promise<string[]> {
  const { common, source, filesystem } = input;
  const diagnostics: string[] = [];
  const slugs = landedSkillSlugs(filesystem.workspaceRel, input.landed);
  if (slugs.size > 0) {
    const outcome = await publishSkillsView({
      target: { ...common, family: "skills" },
      source,
      filesystem,
      slugs,
      base: async () =>
        isSkillsView(input.result.skillsView)
          ? input.result.skillsView
          : undefined,
    });
    const failure = docNotLandedReason(outcome);
    if (failure) diagnostics.push(`skills: ${failure}`);
  }
  if (input.learnings) {
    const outcome = await publishLearningsDoc(
      { ...common, family: "learnings" },
      source,
      filesystem.workspaceRel,
    );
    const failure = docNotLandedReason(outcome);
    if (failure) diagnostics.push(`learnings: ${failure}`);
  }
  return diagnostics;
}
