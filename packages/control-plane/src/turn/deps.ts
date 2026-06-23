import type { IncomingMessage, ServerResponse } from "node:http";
import type { Agent, Workspace } from "../domain/types";
import type { CredentialStore, WorkspaceCredential } from "../ports";
import type { Vfs } from "../vfs";
import type { ConnectManager } from "./connect";
import type { TurnQuota } from "./quota";
import type { TurnRelay } from "./relay";

/**
 * Shared wiring for the cloudrun dispatch path: the dependency bundle plus the
 * tiny HTTP/object-key helpers dispatch.ts and start-turn.ts both use.
 */
export interface TurnDeps {
  runtimeUrl: string;
  turnToken: string;
  relay: TurnRelay;
  quota: TurnQuota;
  vfs: Vfs;
  credentials: CredentialStore;
  connect: ConnectManager;
  /** Central refresher (injectable for tests). */
  refresh: (cred: WorkspaceCredential) => Promise<WorkspaceCredential>;
  /** Google ID token for Cloud Run IAM on the runtime; null on dev. */
  idToken: () => Promise<string | null>;
  codexModels: string[];
}

export const PROVIDER = "openai-codex";
export const PROVIDER_NAME = "ChatGPT / Codex (Plus / Pro)";

export type Settings = {
  activeProvider?: string;
  models?: Record<string, string>;
  /** Reasoning effort baked into each turn (mapped to pi's thinking level). */
  effort?: string;
};

export function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export async function readJson(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<
    string,
    unknown
  >;
}

export const prefixFor = (ws: Workspace, agent: Agent) =>
  `ws/${ws.id}/${agent.id}`;
export const settingsKey = (p: string) => `${p}/data/settings.json`;
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
