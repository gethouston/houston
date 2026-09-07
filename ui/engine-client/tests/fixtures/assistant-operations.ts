import {
  agentPath,
  type ControlPlaneConfig,
  cpFetch,
} from "./assistant-transport";

interface Thing {
  id: string;
}

interface ThingSeed {
  claudeMd?: string;
}

/** A module-scope path helper, like `cp/integrations.ts`'s `integrationPath`. */
const integrationPath = (provider: string) =>
  `/v1/integrations/${encodeURIComponent(provider)}`;

/**
 * Every thing in the workspace.
 *
 * @assistant group:agents
 */
export async function listThings(cfg: ControlPlaneConfig): Promise<Thing[]> {
  const res = await cpFetch(cfg, "/v1/things");
  return ((await res.json()) as { items: Thing[] }).items;
}

export async function listAgentThings(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<Thing[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/things`);
  return (await res.json()) as Thing[];
}

export async function getThing(
  cfg: ControlPlaneConfig,
  agentId: string,
  id: string,
): Promise<Thing> {
  const res = await cpFetch(
    cfg,
    `${agentPath(agentId)}/things/${encodeURIComponent(id)}`,
  );
  return (await res.json()) as Thing;
}

/** The multi-segment escape: `/` separators survive, each segment is escaped. */
export async function readThingFile(
  cfg: ControlPlaneConfig,
  agentId: string,
  relPath: string,
): Promise<string> {
  const res = await cpFetch(
    cfg,
    `${agentPath(agentId)}/thingfile/${relPath.split("/").map(encodeURIComponent).join("/")}`,
  );
  return ((await res.json()) as { content: string }).content;
}

export async function integrationThings(
  cfg: ControlPlaneConfig,
  provider: string,
): Promise<Thing[]> {
  const res = await cpFetch(cfg, `${integrationPath(provider)}/things`);
  return (await res.json()) as Thing[];
}

export async function thingUsage(
  cfg: ControlPlaneConfig,
  days: number,
): Promise<Thing[]> {
  const res = await cpFetch(
    cfg,
    `/v1/things/usage?days=${encodeURIComponent(days.toString())}`,
  );
  return (await res.json()) as Thing[];
}

export async function updateThing(
  cfg: ControlPlaneConfig,
  id: string,
  patch: Thing,
): Promise<void> {
  await cpFetch(cfg, `/v1/things/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function createThing(
  cfg: ControlPlaneConfig,
  name: string,
  label: string,
  seed?: ThingSeed,
): Promise<void> {
  await cpFetch(cfg, "/v1/things", {
    method: "POST",
    body: JSON.stringify({ name, alias: label, claudeMd: seed?.claudeMd }),
  });
}

/** A pre-serialized blob sent as-is, without `JSON.stringify`. */
export async function pushCredential(
  cfg: ControlPlaneConfig,
  agentId: string,
  payload: string,
): Promise<void> {
  await cpFetch(cfg, `${agentPath(agentId)}/credential`, {
    method: "PUT",
    body: payload,
  });
}

/**
 * Delete one thing.
 *
 * @assistant group:agents confirm
 */
export async function deleteThing(
  cfg: ControlPlaneConfig,
  id: string,
  signal: AbortSignal,
): Promise<void> {
  await cpFetch(cfg, `/v1/things/${encodeURIComponent(id)}`, {
    method: "DELETE",
    signal,
  });
}

/** Pure client-side computation: no request, so no operation. */
export function thingLabel(thing: Thing): string {
  return thing.id.toUpperCase();
}

export async function replaceThing(
  cfg: ControlPlaneConfig,
  id: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/things/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  await cpFetch(cfg, "/v1/things", { method: "POST" });
}

export async function getThingContext(
  cfg: ControlPlaneConfig,
  kind: "workspace" | "user",
): Promise<string> {
  const res = await cpFetch(cfg, `/v1/${kind}-context`);
  return ((await res.json()) as { content: string }).content;
}

export async function allThings(
  cfg: ControlPlaneConfig,
  includeArchived: boolean,
): Promise<void> {
  await cpFetch(cfg, includeArchived ? "/v1/things/all" : "/v1/things");
}

export async function tagThing(
  cfg: ControlPlaneConfig,
  id: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/things/${encodeURIComponent(id)}/tags`, {
    method: "POST",
    body: JSON.stringify({ id: id.trim() }),
  });
}

export async function probeThing(
  cfg: ControlPlaneConfig,
  id: string,
  force: boolean,
): Promise<void> {
  await cpFetch(cfg, `/v1/things/${encodeURIComponent(id)}`, {
    method: "POST",
    ...(force ? { body: "{}" } : {}),
  });
}

export async function headThing(
  cfg: ControlPlaneConfig,
  id: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/things/${encodeURIComponent(id)}`, {
    method: "HEAD",
  });
}
