import type { IncomingMessage, ServerResponse } from "node:http";
import {
  filterPackage,
  invalidAgentNameMessage,
  type PortablePackage,
  packageSeed,
  portableInventory,
  remintRoutineIds,
  seedSchemas,
  unpackAgent,
  validateAgentName,
} from "@houston/domain";
import type { PortableSelection } from "@houston/protocol";
import { ACTING_AS_HEADER, actingSubFromHeader } from "../auth/acting";
import type { Agent, UserId } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { CloudPaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { seedOrRollBack } from "./agent-create-rollback";
import { refuseReservedAgentName } from "./agent-name-reserved";
import { answerAgentNameTaken } from "./agent-name-taken";
import { writeAgentSeeds } from "./agent-seed";
import { json, readJson } from "./http";
import { defineRouteFamily } from "./registry";

async function readBytes(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export interface PortableAccountDeps {
  store: WorkspaceStore;
  vfs?: Vfs;
  paths?: WorkspacePaths;
  gatewayFronted?: boolean;
  ownerSub?: string;
}

async function handlePortableAccount(
  deps: PortableAccountDeps,
  userId: UserId,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (
    method !== "POST" ||
    (path !== "/v1/portable/preview" && path !== "/v1/portable/install")
  ) {
    return false;
  }
  if (!deps.vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const paths = deps.paths ?? new CloudPaths();

  if (path === "/v1/portable/preview") {
    let pkg: PortablePackage;
    try {
      pkg = unpackAgent(new Uint8Array(await readBytes(req)));
    } catch (err) {
      json(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      });
      return true;
    }
    json(res, 200, {
      manifest: pkg.manifest,
      inventory: portableInventory(pkg),
    });
    return true;
  }

  const body = await readJson(req);
  if (
    !body.agentName ||
    typeof body.agentName !== "string" ||
    typeof body.archive !== "string"
  ) {
    json(res, 400, { error: "missing 'agentName' or 'archive' (base64)" });
    return true;
  }
  const nameCheck = validateAgentName(body.agentName);
  if (!nameCheck.ok) {
    json(res, 400, { error: invalidAgentNameMessage(nameCheck.reason) });
    return true;
  }
  if (refuseReservedAgentName(deps, res, nameCheck.name)) return true;
  let pkg: PortablePackage;
  try {
    pkg = unpackAgent(new Uint8Array(Buffer.from(body.archive, "base64")));
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    return true;
  }
  if (body.selection !== undefined) {
    pkg = filterPackage(pkg, body.selection as PortableSelection);
  }
  const identity = remintRoutineIds(pkg, () => crypto.randomUUID());
  pkg = identity.pkg;

  const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
  let agent: Agent;
  try {
    agent = await deps.store.createAgent({
      workspaceId: ws.id,
      name: nameCheck.name,
    });
  } catch (err) {
    if (answerAgentNameTaken(res, err)) return true;
    throw err;
  }
  const root = paths.agentRoot(ws, agent);
  const vfs = deps.vfs;
  const routineCreatedBy = deps.gatewayFronted
    ? (actingSubFromHeader(req.headers[ACTING_AS_HEADER]) ?? deps.ownerSub)
    : userId;
  await seedOrRollBack({ store: deps.store, vfs }, agent, root, async () => {
    await seedSchemas(vfs, root);
    await writeAgentSeeds(vfs, root, packageSeed(pkg), routineCreatedBy);
  });

  json(res, 201, {
    agent,
    installed: portableInventory(pkg),
    routineIds: identity.routineIds,
  });
  return true;
}

defineRouteFamily({
  group: "portable-account",
  members: [
    { method: "POST", path: "/v1/portable/preview" },
    { method: "POST", path: "/v1/portable/install" },
  ],
  phase: "user",
  classification: "sdk",
  source: "packages/host/src/routes/portable-account.ts",
  handler: async ({ deps, userId, method, path, req, res }) => {
    await handlePortableAccount(deps, userId, method, path, req, res);
  },
});
