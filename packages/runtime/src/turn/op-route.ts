import { join } from "node:path";
import type { CustomIntegrationManager } from "@houston/host/src/integrations/custom/manager";
import { dispatchAgentOp } from "@houston/host/src/op/dispatch";
import { archiveTouchesRuntime } from "@houston/host/src/routes/migration-import";
import { PrefixedVfs } from "@houston/host/src/vfs";
import type { HoustonEvent } from "@houston/protocol";
import type { OpResult } from "./op-apply";
import { agentRouteScope, engineAgentId } from "./op-apply";
import { isCustomIntegrationOpRoute } from "./op-route-allowlist";
import type { OpRequest } from "./parse-op-request";
import type { TurnFilesystem } from "./turn-filesystem";
import { poolIdentity } from "./turn-store";

type RouteOp = OpRequest & { op: Extract<OpRequest["op"], { kind: "route" }> };

/** The store-root definitions file custom-integration ops read and write. */
const CUSTOM_DEFS_FILE = "custom-integrations.json";

const decline = (include: OpResult["include"]): OpResult => ({
  status: 503,
  contentType: "application/json",
  body: JSON.stringify({ error: "the pod serves this one" }),
  events: [],
  include,
  decline: true,
});

/** An add whose auth mode is the browser sign-in (pod-only capability). */
function oauthAddBody(body: string | undefined): boolean {
  try {
    return JSON.parse(body ?? "{}").auth === "oauth";
  } catch {
    return false; // the handler owns the 400 for a malformed body
  }
}

/**
 * A `route` op: the pod's own handler chain over the hydrated tree. Custom
 * integrations additionally get a per-op manager (definitions at the store
 * root, secrets in the gateway's custom-secret store, a fresh in-memory
 * executor) — the same construction the pod boots with, minus OAuth sign-in,
 * whose pending state lives only in a pod's memory.
 */
export async function applyRouteOp(
  op: RouteOp,
  filesystem: TurnFilesystem,
  fetchImpl?: typeof fetch,
): Promise<OpResult> {
  const include = agentRouteScope(filesystem.workspaceRel);
  const { method, rest } = op.op;
  // parseOpRequest already proved the rest decodes (and validated the
  // decoded form against the allowlist).
  const decoded = decodeURIComponent(rest);

  // Desktop→cloud migration: an archive that carries runtime transcripts
  // needs the pod (agentDir-anchored session synthesis + the transcript
  // authority's projector). File/core-only chunks — and every status /
  // complete / export call — run here.
  if (decoded === "migration/import" && op.op.bodyBase64) {
    if (archiveTouchesRuntime(Buffer.from(op.op.bodyBase64, "base64"))) {
      return decline(include);
    }
  }
  // Adding an OAuth-auth integration mints a capability answer only the pod
  // can honor (its callback + pending state) — decline before any write.
  if (
    decoded === "integrations/custom/definitions" &&
    method === "POST" &&
    oauthAddBody(op.op.body)
  ) {
    return decline(include);
  }

  const custom = isCustomIntegrationOpRoute(decoded)
    ? await customIntegrationContext(op, filesystem, fetchImpl)
    : null;
  try {
    return await runRouteOp(op, filesystem, decoded, custom, fetchImpl);
  } finally {
    // The per-op executor holds live MCP connections — a long-lived worker
    // must not accumulate them.
    await custom?.dispose();
  }
}

async function runRouteOp(
  op: RouteOp,
  filesystem: TurnFilesystem,
  decoded: string,
  custom: CustomContext | null,
  fetchImpl?: typeof fetch,
): Promise<OpResult> {
  const agentId = engineAgentId(filesystem);
  const include = agentRouteScope(filesystem.workspaceRel);
  // The handlers address the agent under `workspaces/`; the turn's vfs
  // is rooted one level up (lazy or real, the same seam).
  const vfs = new PrefixedVfs(filesystem.vfs, "workspaces");
  const dispatch = (
    request: Parameters<typeof dispatchAgentOp>[0]["request"],
  ) =>
    dispatchAgentOp({
      workspacesRoot: join(filesystem.storeRoot, "workspaces"),
      agentId,
      vfs,
      request,
      ...(custom ? { customIntegrations: custom.manager } : {}),
      ...(fetchImpl ? { fetchImpl } : {}),
    });
  const result = await dispatch({
    method: op.op.method,
    rest: op.op.rest,
    ...(op.op.query ? { query: op.op.query } : {}),
    ...(op.op.body !== undefined ? { body: op.op.body } : {}),
    ...(op.op.bodyBase64 !== undefined ? { bodyBase64: op.op.bodyBase64 } : {}),
    ...(op.op.contentType ? { contentType: op.op.contentType } : {}),
    ...(op.actingAs
      ? {
          actingSub: op.actingAs.userId,
          // Gateway-fronted: the acting human is a full contributor on
          // missions, exactly as the pod stamps it from the acting header.
          actingAuthor: {
            user_id: op.actingAs.userId,
            ...(op.actingAs.name ? { name: op.actingAs.name } : {}),
          },
        }
      : {}),
    triggersEnabled: op.triggersEnabled,
  });

  // A detect that hits an OAuth wall carries `oauthSupported`, which only
  // the pod (the deployment that runs the browser sign-in) can answer —
  // decline so the response never diverges. Read-only, so nothing to undo.
  if (custom && decoded === "integrations/custom/detect") {
    try {
      if (JSON.parse(result.body).requiresOAuth === true)
        return decline(include);
    } catch {
      /* non-JSON answers relay as-is */
    }
  }

  const events: HoustonEvent[] = [...result.events];
  const out: OpResult = {
    ...result,
    events,
    include: custom
      ? (rel) => include(rel) || rel === CUSTOM_DEFS_FILE
      : include,
  };
  if (custom?.changed()) {
    events.push({ type: "CustomIntegrationsChanged" });
    // Re-capture the definitions view the way the pod's route serves it, so
    // the gateway's asleep reads show the mutation immediately.
    out.customDefinitionsView = { items: await custom.manager.list() };
  }
  if (result.events.some((e) => e.type === "SkillsChanged")) {
    // Re-capture the skills view the way the pod would serve it, so the
    // gateway's asleep reads show the install/remove immediately.
    const view = await dispatch({
      method: "GET",
      rest: "skills",
      triggersEnabled: op.triggersEnabled,
    });
    if (view.status === 200) {
      try {
        out.skillsView = JSON.parse(view.body);
      } catch {
        /* not JSON: leave the previous view */
      }
    }
  }
  return out;
}

interface CustomContext {
  manager: CustomIntegrationManager;
  changed: () => boolean;
  dispose: () => Promise<void>;
}

async function customIntegrationContext(
  op: RouteOp,
  filesystem: TurnFilesystem,
  fetchImpl?: typeof fetch,
): Promise<CustomContext> {
  // Materialize the store-root definitions file into the lazy overlay (and
  // its manifest) BEFORE the raw-fs store reads it: an unmaterialized file
  // would read as "no definitions" and a later write would CAS-create over
  // the real one.
  await filesystem.vfs.readBytes(CUSTOM_DEFS_FILE);
  // Imported lazily: the embedded executor engine is heavy, and only the
  // rare custom-integration op needs it — worker startup must not pay it.
  const [
    { CustomExecutorHost },
    { CustomIntegrationManager },
    { RemoteCustomSecretStore },
    { FileCustomIntegrationStore },
  ] = await Promise.all([
    import("@houston/host/src/integrations/custom/executor-host"),
    import("@houston/host/src/integrations/custom/manager"),
    import("@houston/host/src/integrations/custom/secrets"),
    import("@houston/host/src/integrations/custom/store"),
  ]);
  const { org, agent } = poolIdentity(op.gcsPrefix);
  const store = new FileCustomIntegrationStore(
    join(filesystem.storeRoot, CUSTOM_DEFS_FILE),
  );
  const secrets = new RemoteCustomSecretStore({
    baseUrl: new URL(op.claim.heartbeatUrl).origin,
    orgSlug: org,
    agentSlug: agent,
    podToken: op.hostToken,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  const executor = new CustomExecutorHost(secrets, () => store.list());
  let changed = false;
  const manager = new CustomIntegrationManager(
    store,
    secrets,
    executor,
    () => {
      changed = true;
    },
    // No OAuth options: sign-in never runs here (see the module doc).
    {},
  );
  return {
    manager,
    changed: () => changed,
    dispose: () => executor.reset(),
  };
}
