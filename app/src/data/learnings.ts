/** `.houston/learnings/learnings.json` — persistent lessons the agent has recorded. */

import schema from "@houston-ai/agent-schemas/learnings.schema.json";
import { newId, now, readAgentJson, writeAgentJson } from "./agent-file";

export interface Learning {
  id: string;
  text: string;
  created_at: string;
}

const NAME = "learnings";
const s = schema as unknown as Parameters<typeof readAgentJson>[2];

export async function list(agentPath: string): Promise<Learning[]> {
  return readAgentJson<Learning[]>(agentPath, NAME, s, []);
}

export async function add(agentPath: string, text: string): Promise<Learning> {
  const items = await list(agentPath);
  const learning: Learning = { id: newId(), text, created_at: now() };
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
