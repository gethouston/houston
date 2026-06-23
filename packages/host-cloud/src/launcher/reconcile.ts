import type { Agent } from "@houston/host/src/domain/types";
import {
  deploymentName,
  namespaceFor,
  pvcName,
  serviceName,
} from "@houston/host/src/launcher/names";
import {
  type AppsV1Api,
  type CoreV1Api,
  HttpError,
} from "@kubernetes/client-node";
import {
  buildDeployment,
  buildNamespace,
  buildPvc,
  buildScale,
  buildService,
} from "./manifest";

/**
 * Low-level, idempotent apiserver reconcile steps used by GkeLauncher.
 * Each "ensure" reads-then-creates so a re-run is a no-op; the only swallowed
 * statuses are 404 (read miss -> create) and 409 (raced create -> already
 * there). Every other apiserver error propagates per the no-silent-failure rule.
 */

const MERGE_PATCH = {
  headers: { "content-type": "application/merge-patch+json" },
} as const;

export function isStatus(err: unknown, code: number): boolean {
  return err instanceof HttpError && err.statusCode === code;
}

/** Create, treating 409 Conflict (raced create) as success. */
async function createIgnoringExisting(
  op: () => Promise<unknown>,
): Promise<void> {
  try {
    await op();
  } catch (err) {
    if (isStatus(err, 409)) return;
    throw err;
  }
}

/** Delete, treating 404 Not Found as success (already gone). */
export async function deleteIgnoringMissing(
  op: () => Promise<unknown>,
): Promise<void> {
  try {
    await op();
  } catch (err) {
    if (isStatus(err, 404)) return;
    throw err;
  }
}

export async function ensureNamespace(
  core: CoreV1Api,
  workspaceSlug: string,
): Promise<void> {
  try {
    await core.readNamespace(namespaceFor(workspaceSlug));
  } catch (err) {
    if (!isStatus(err, 404)) throw err;
    await createIgnoringExisting(() =>
      core.createNamespace(buildNamespace(workspaceSlug)),
    );
  }
}

export async function ensurePvc(
  core: CoreV1Api,
  agent: Agent,
  workspaceSlug: string,
): Promise<void> {
  const ns = namespaceFor(workspaceSlug);
  try {
    await core.readNamespacedPersistentVolumeClaim(pvcName(agent.id), ns);
  } catch (err) {
    if (!isStatus(err, 404)) throw err;
    await createIgnoringExisting(() =>
      core.createNamespacedPersistentVolumeClaim(
        ns,
        buildPvc(agent, workspaceSlug),
      ),
    );
  }
}

export async function ensureDeployment(
  apps: AppsV1Api,
  agent: Agent,
  workspaceSlug: string,
  token: string,
): Promise<void> {
  const ns = namespaceFor(workspaceSlug);
  try {
    await apps.readNamespacedDeployment(deploymentName(agent.id), ns);
    // Exists -> ensure scaled up (wake from sleep).
    await scaleDeployment(apps, ns, deploymentName(agent.id), 1);
  } catch (err) {
    if (!isStatus(err, 404)) throw err;
    await createIgnoringExisting(() =>
      apps.createNamespacedDeployment(
        ns,
        buildDeployment(agent, workspaceSlug, token),
      ),
    );
  }
}

export async function ensureService(
  core: CoreV1Api,
  agent: Agent,
  workspaceSlug: string,
): Promise<void> {
  const ns = namespaceFor(workspaceSlug);
  try {
    await core.readNamespacedService(serviceName(agent.id), ns);
  } catch (err) {
    if (!isStatus(err, 404)) throw err;
    await createIgnoringExisting(() =>
      core.createNamespacedService(ns, buildService(agent, workspaceSlug)),
    );
  }
}

export function scaleDeployment(
  apps: AppsV1Api,
  ns: string,
  name: string,
  replicas: number,
): Promise<unknown> {
  return apps.patchNamespacedDeploymentScale(
    name,
    ns,
    buildScale(replicas),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    MERGE_PATCH,
  );
}

export async function waitForReady(
  apps: AppsV1Api,
  ns: string,
  name: string,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { body } = await apps.readNamespacedDeployment(name, ns);
    if ((body.status?.readyReplicas ?? 0) > 0) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `sandbox ${ns}/${name} did not become ready within ${timeoutMs}ms`,
      );
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}
