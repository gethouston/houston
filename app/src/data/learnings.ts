/** `.houston/learnings/learnings.json` — persistent lessons the agent has recorded. */

import schema from "@houston-ai/agent-schemas/learnings.schema.json";
import { serialQueue } from "../lib/serial-queue";
import { readAgentJson, writeAgentJson } from "./agent-file";

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
  /** Set when consolidation archived this memory; kept on disk, never shown. */
  archived_at?: string;
  /** The learning that replaced this archived one. */
  replaced_by?: string;
}

const NAME = "learnings";
const s = schema as unknown as Parameters<typeof readAgentJson>[2];

/**
 * Every write is a read-modify-write of the whole file, and the Memory tab no
 * longer waits for one to land before offering the next (writes are painted
 * optimistically). Two in flight together would each write the list they
 * read, dropping the other's change, so writes queue per agent.
 */
const queued = serialQueue();

export async function list(agentPath: string): Promise<Learning[]> {
  return readAgentJson<Learning[]>(agentPath, NAME, s, []);
}

/**
 * Add a learning the USER typed in the Memory tab, built whole by the caller
 * (`newLearning`, `lib/learning-optimistic.ts`) so the row painted before the
 * write lands is the row the file ends up holding, id included.
 */
export function add(agentPath: string, learning: Learning): Promise<void> {
  return queued(agentPath, async () => {
    const items = await list(agentPath);
    await writeAgentJson(agentPath, NAME, s, [...items, learning]);
  });
}

export function update(
  agentPath: string,
  id: string,
  text: string,
): Promise<void> {
  return queued(agentPath, async () => {
    const items = await list(agentPath);
    const idx = items.findIndex((l) => l.id === id);
    if (idx === -1) throw new Error(`Learning not found: ${id}`);
    const next = [...items];
    next[idx] = { ...items[idx], text };
    await writeAgentJson(agentPath, NAME, s, next);
  });
}

/**
 * Removing a learning the file no longer holds is a success: the user wanted
 * it gone and it is. It happens when a remove queued behind the same
 * learning's add that the host refused, or behind another surface's delete.
 */
export function remove(agentPath: string, id: string): Promise<void> {
  return queued(agentPath, async () => {
    const items = await list(agentPath);
    const next = items.filter((l) => l.id !== id);
    if (next.length === items.length) return;
    await writeAgentJson(agentPath, NAME, s, next);
  });
}
