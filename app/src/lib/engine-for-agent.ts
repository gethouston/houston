/**
 * Local desktop: always route provider calls to the sidecar engine.
 */

import type { HoustonClient } from "@houston-ai/engine-client";
import { agentFromPath, currentAgent } from "./agent-lookup";
import { getEngine } from "./engine";
import type { Agent } from "./types";

export function agentForEngine(agentPath?: string | null): Agent | null {
  if (!agentPath) return currentAgent();
  const fromPath = agentFromPath(agentPath);
  if (fromPath) return fromPath;
  const current = currentAgent();
  if (current?.folderPath === agentPath) return current;
  return null;
}

export async function resolveEngine(
  _agent?: Agent | null,
  _agentPath?: string | null,
): Promise<HoustonClient> {
  return getEngine();
}

export async function resolveEngineForPath(_agentPath: string): Promise<HoustonClient> {
  return getEngine();
}
