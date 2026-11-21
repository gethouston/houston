import type {
  MigrationCounts,
  MigrationSource,
  UploadProgress,
} from "@houston/engine-adapter";
import type { SourceAgent } from "./cloud-migration";
import {
  type MigrationCallDeps,
  type MigrationGatewayEngine,
  migrationCall,
  nullOn404,
} from "./cloud-migration-errors.ts";
import { getEngine } from "./engine";
import i18n from "./i18n";

export interface SourceHostHandshake {
  baseUrl: string;
  token: string;
}

function sourceFetch(
  src: SourceHostHandshake,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${src.baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${src.token}`, ...init?.headers },
  });
}

async function throwHttpError(label: string, res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  const detail =
    typeof body.error === "string" && body.error
      ? body.error
      : `HTTP ${res.status}`;
  throw new Error(`${label}: ${detail}`);
}

export interface SourceScan {
  agents: SourceAgent[];
  accountIntegrations: string[];
}

export async function fetchSourceScan(
  src: SourceHostHandshake,
): Promise<SourceScan> {
  const res = await sourceFetch(src, "/v1/migration/source");
  if (!res.ok) await throwHttpError("migration source scan", res);
  const body = (await res.json()) as {
    agents: SourceAgent[];
    accountIntegrations?: string[];
  };
  return {
    agents: body.agents,
    accountIntegrations: body.accountIntegrations ?? [],
  };
}

export async function exportSourceZip(
  src: SourceHostHandshake,
  sourceAgentId: string,
  paths: string[],
): Promise<ArrayBuffer> {
  const res = await sourceFetch(
    src,
    `/agents/${encodeURIComponent(sourceAgentId)}/migration/export`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    },
  );
  if (!res.ok) await throwHttpError("migration export", res);
  return await res.arrayBuffer();
}

function gatewayDeps(): MigrationCallDeps {
  return {
    engine: getEngine,
    copy: {
      notConnected: i18n.t("migration:transport.notConnected"),
      signedOut: i18n.t("migration:transport.signedOut"),
    },
  };
}

const cloudCall = <T>(
  label: string,
  call: (engine: MigrationGatewayEngine) => Promise<T>,
): Promise<T> => migrationCall(label, gatewayDeps(), call);

export const importAgentZip = (
  agentId: string,
  zip: ArrayBuffer,
  opts?: {
    overwrite?: boolean;
    onProgress?: (progress: UploadProgress) => void;
  },
) =>
  cloudCall("migration import", (engine) =>
    engine.migrationImport(agentId, zip, opts),
  );

export const completeAgentMigration = (
  agentId: string,
  source: MigrationSource,
  counts: MigrationCounts,
) =>
  cloudCall("migration complete", (engine) =>
    engine.migrationComplete(agentId, source, counts),
  );

export const agentMigrationStatus = (agentId: string) =>
  cloudCall("migration status", (engine) =>
    nullOn404(() => engine.migrationStatus(agentId)),
  );
