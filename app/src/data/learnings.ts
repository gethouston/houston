/** `.houston/learnings/learnings.json` — persistent lessons the agent has recorded. */

import schema from "@houston-ai/agent-schemas/learnings.schema.json";
import { newId, now, readAgentJson, writeAgentJson } from "./agent-file";

/** WHO taught a learning. Mirrors the protocol's `ActivityContributor`. */
export interface LearningAuthor {
  user_id: string;
  name?: string;
}

export interface Learning {
  id: string;
  text: string;
  created_at: string;
  /**
   * Provenance: the person this learning came from. Stamped by the host from
   * the gateway's acting-as identity when an agent turn saved it, or here from
   * the signed-in session when a person added it in Memory. Absent on
   * desktop / single-player, which keeps those files identity-key free.
   */
  taught_by?: LearningAuthor;
  /** Provenance: the mission whose conversation taught this learning. */
  mission_id?: string;
  /** The mission's title at save time, the fallback when the live one is gone. */
  mission_title?: string;
}

const NAME = "learnings";
const s = schema as unknown as Parameters<typeof readAgentJson>[2];

export async function list(agentPath: string): Promise<Learning[]> {
  return readAgentJson<Learning[]>(agentPath, NAME, s, []);
}

/**
 * Add a learning the USER typed in the Memory tab.
 *
 * `taughtBy` is provenance, passed in by the caller (see `useAddLearning`) and
 * stamped ONLY in multiplayer — a single-player file has one author by
 * definition, so it stays free of identity keys and byte-identical in shape to
 * what earlier versions wrote. No mission is stamped here: a learning typed in
 * settings did not come from one.
 */
export async function add(
  agentPath: string,
  text: string,
  taughtBy?: LearningAuthor,
): Promise<Learning> {
  const items = await list(agentPath);
  const learning: Learning = {
    id: newId(),
    text,
    created_at: now(),
    ...(taughtBy ? { taught_by: taughtBy } : {}),
  };
  await writeAgentJson(agentPath, NAME, s, [...items, learning]);
  return learning;
}

export async function update(
  agentPath: string,
  id: string,
  text: string,
): Promise<Learning> {
  const items = await list(agentPath);
  const idx = items.findIndex((l) => l.id === id);
  if (idx === -1) throw new Error(`Learning not found: ${id}`);
  const updated: Learning = { ...items[idx], text };
  const next = [...items];
  next[idx] = updated;
  await writeAgentJson(agentPath, NAME, s, next);
  return updated;
}

export async function remove(agentPath: string, id: string): Promise<void> {
  const items = await list(agentPath);
  const next = items.filter((l) => l.id !== id);
  if (next.length === items.length)
    throw new Error(`Learning not found: ${id}`);
  await writeAgentJson(agentPath, NAME, s, next);
}
