import type {
  CommunitySkill,
  CommunitySkillPreview,
  InstalledSkillEditorState,
  RepoSkill,
  SkillEditModalLabels,
} from "@houston-ai/skills";
import type { Agent, SkillSummary } from "../../lib/types";
import type { DeleteConfirmLabels } from "./skill-editor-dialogs";

/** Props contract for {@link SkillsContent}, split out to hold the file law. */
export interface SkillsContentProps {
  /** The agent whose skills these are — the setup chats run against it. */
  agent: Agent;
  skills: SkillSummary[];
  loading: boolean;
  /**
   * Managed-agent read-only mode (matrix v2): a non-manager may view skills but
   * not add/create/install any. Hides the discovery tabs and the add CTA.
   * The gateway 403s writes regardless.
   */
  readOnly?: boolean;
  /** Name of the installed skill whose edit modal is open, if any. */
  editingSkillName: string | null;
  editorState: InstalledSkillEditorState;
  onEditSkill: (name: string) => void;
  onCloseEdit: () => void;
  onSaveEditing: (content: string) => Promise<void>;
  onDeleteSkill: (name: string) => Promise<void>;
  editModalLabels: SkillEditModalLabels;
  deleteConfirm: DeleteConfirmLabels;
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
