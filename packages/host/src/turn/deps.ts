import type { ServerResponse } from "node:http";
import type { Agent, Workspace } from "../domain/types";
import type { CredentialStore, WorkspaceCredential } from "../ports";
import type { Vfs } from "../vfs";
import type { ConnectManager } from "./connect";
import type { FrameForwarder } from "./frame-forwarder";
import type { TurnQuota } from "./quota";
import type { TurnRelay } from "./relay";

export interface TurnDeps {
  runtimeUrl: string;
  turnToken: string;
  relay: TurnRelay;
  quota: TurnQuota;
  vfs: Vfs;
  credentials: CredentialStore;
  connect: ConnectManager;
  refresh: (cred: WorkspaceCredential) => Promise<WorkspaceCredential>;
  idToken: () => Promise<string | null>;
  codexModels: string[];
  frameForwarder?: Pick<FrameForwarder, "capture">;
}

export const PROVIDER = "openai-codex";
export const PROVIDER_NAME = "ChatGPT / Codex (Plus / Pro)";

export type Settings = {
  activeProvider?: string;
  models?: Record<string, string>;
  effort?: string;
};

export function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export { methodNotAllowed } from "../routes/http";
export { readJson } from "../routes/read-body";

export const prefixFor = (ws: Workspace, agent: Agent) =>
  `ws/${ws.id}/${agent.id}`;
export const settingsKey = (p: string) => `${p}/data/settings.json`;
export const customEndpointKey = (p: string) =>
  `${p}/data/custom-endpoint.json`;
export const conversationKey = (p: string, cid: string) =>
  `${p}/data/conversations/${encodeURIComponent(cid)}.json`;

export async function readSettings(
  deps: TurnDeps,
  prefix: string,
): Promise<Settings> {
  const raw = await deps.vfs.readText(settingsKey(prefix));
  if (!raw) return {};
  return JSON.parse(raw) as Settings;
}
