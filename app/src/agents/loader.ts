import { tauriAgents } from "../lib/tauri";
import type { AgentConfig, AgentDefinition } from "../lib/types";
import { builtinConfigs } from "./builtin";

export async function loadAllConfigs(): Promise<AgentDefinition[]> {
  const byId = new Map<string, AgentDefinition>();

  for (const cfg of builtinConfigs) {
    byId.set(cfg.id, { config: cfg, source: "builtin" });
  }

  try {
    const installed = (await tauriAgents.listInstalledConfigs()) as Array<{
      config: AgentConfig;
      path: string;
    }>;
    for (const inst of installed) {
      byId.set(inst.config.id, {
        config: inst.config,
        source: "installed",
        path: inst.path,
      });
    }
  } catch {
    console.warn("Could not load installed agent configs");
  }

  return Array.from(byId.values());
}
