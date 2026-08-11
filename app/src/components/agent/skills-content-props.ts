import type {
  CommunitySkill,
  CommunitySkillPreview,
  RepoSkill,
} from "@houston-ai/skills";
import type { Agent, SkillSummary } from "../../lib/types";

/** Props contract for {@link SkillsContent}, split out to hold the file law. */
export interface SkillsContentProps {
  /** The agent whose skills these are — the setup chats run against it. */
  agent: Agent;
  skills: SkillSummary[];
  loading: boolean;
  onSearch?: (query: string, signal?: AbortSignal) => Promise<CommunitySkill[]>;
  onInstallCommunity?: (
    skill: CommunitySkill,
    signal?: AbortSignal,
  ) => Promise<string>;
  onPreviewCommunity?: (
    skill: CommunitySkill,
    signal?: AbortSignal,
  ) => Promise<CommunitySkillPreview>;
  onListFromRepo?: (source: string) => Promise<RepoSkill[]>;
  onInstallFromRepo?: (
    source: string,
    skills: RepoSkill[],
  ) => Promise<string[]>;
  onCreateFromScratch?: (input: {
    name: string;
    description: string;
    content: string;
  }) => Promise<string>;
  installedSkillNames?: Set<string>;
}
