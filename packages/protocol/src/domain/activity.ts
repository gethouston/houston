import { z } from "zod";
import type { TurnMode } from "../conversation";
import type { PendingInteraction } from "./interaction";
import type { MissionStarter } from "./mission-starter";

export interface ActivityContributor {
  user_id: string;
  name?: string;
}

export interface ActivityMention {
  user_id: string;
  at: string;
  by?: string;
}

export const ACTIVITY_MENTIONS_MAX = 32;

export const activityStampSchema = z.literal("last_message");
export type ActivityStamp = z.infer<typeof activityStampSchema>;

export interface Activity {
  id: string;
  title: string;
  description: string;
  status: string;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  worktree_path?: string | null;
  routine_id?: string;
  routine_run_id?: string;
  skill_slug?: string;
  updated_at?: string;
  last_message_at?: string;
  provider?: string;
  model?: string;
  mode?: TurnMode;
  pending_interaction?: PendingInteraction;
  origin_session_key?: string;
  origin_agent?: string;
  origin_depth?: number;
  started_by?: MissionStarter;
  created_by?: string;
  contributors?: ActivityContributor[];
  mentioned?: ActivityMention[];
}

export const activityUpdateSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    status: z.string().optional(),
    claude_session_id: z.string().nullable().optional(),
    session_key: z.string().optional(),
    agent: z.string().optional(),
    worktree_path: z.string().nullable().optional(),
    routine_id: z.string().optional(),
    routine_run_id: z.string().optional(),
    skill_slug: z.string().optional(),
    provider: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    mode: z.enum(["execute", "plan", "auto"]).optional(),
    pending_interaction: z.custom<PendingInteraction>().nullable().optional(),
  })
  .strict();

export interface ActivityUpdate {
  title?: string;
  description?: string;
  status?: string;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  worktree_path?: string | null;
  routine_id?: string;
  routine_run_id?: string;
  skill_slug?: string;
  provider?: string | null;
  model?: string | null;
  mode?: TurnMode;
  pending_interaction?: PendingInteraction | null;
}

export interface NewActivity {
  id?: string;
  title: string;
  description?: string;
  agent?: string;
  worktree_path?: string;
  provider?: string;
  model?: string;
  mode?: TurnMode;
  origin_session_key?: string;
}

export interface Learning {
  id: string;
  text: string;
  created_at: string;
  taught_by?: ActivityContributor;
  mission_id?: string;
  mission_title?: string;
}
