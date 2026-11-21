import type { RuntimeSpawner } from "../launcher/process";
import type { ControlPlaneDeps } from "../server";
import type { ManagedHostOptions } from "./host-managed-options";

export interface LocalHostOptions extends ManagedHostOptions {
  workspacesRoot: string;
  houstonHome?: string;
  officeConvert?: { url: string; cacheDir: string };
  credentialsPath: string;
  agentConfigsDir?: string;
  port: number;
  bind?: string;
  token: string;
  redactBannerToken?: boolean;
  runtimeCommand: string[];
  systemPrompt?: string;
  onRuntimeLog?: (line: string) => void;
  spawner?: RuntimeSpawner;
  eagerRuntime?: boolean;
  chatHistoryDbPath?: string;
  capabilities?: ControlPlaneDeps["capabilities"];
  oauthCallbackBase?: string;
}
