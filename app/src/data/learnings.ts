import schema from "@houston-ai/agent-schemas/learnings.schema.json";
import { serialQueue } from "../lib/serial-queue";
import { readAgentJson, writeAgentJson } from "./agent-file";

export interface LearningAuthor {
  user_id: string;
  name?: string;
}

export interface Learning {
  id: string;
  text: string;
  created_at: string;
  taught_by?: LearningAuthor;
  mission_id?: string;
  mission_title?: string;
}

const NAME = "learnings";
const s = schema as unknown as Parameters<typeof readAgentJson>[2];

const queued = serialQueue();

export async function list(agentPath: string): Promise<Learning[]> {
  return readAgentJson<Learning[]>(agentPath, NAME, s, []);
}

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

export function remove(agentPath: string, id: string): Promise<void> {
  return queued(agentPath, async () => {
    const items = await list(agentPath);
    const next = items.filter((l) => l.id !== id);
    if (next.length === items.length) return;
    await writeAgentJson(agentPath, NAME, s, next);
  });
}
