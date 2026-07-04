import type { Agent } from "@houston/host/src/domain/types";
import {
  deploymentName,
  namespaceFor,
  pvcName,
  serviceName,
} from "@houston/host/src/launcher/names";
import type { CredentialVault, RuntimeLauncher } from "@houston/host/src/ports";
import { runRuntimeLauncherContract } from "@houston/host/src/testing/launcher-contract";
import { CoreV1Api, KubeConfig } from "@kubernetes/client-node";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { GkeLauncher } from "./gke";
import {
  ensureDeployment,
  ensureNamespace,
  ensurePvc,
  ensureService,
} from "./reconcile";

/**
 * GkeLauncher against a REAL Kubernetes apiserver — the one cloud adapter that
 * cannot be emulated in-process (it drives the apiserver: Namespace + PVC +
 * Service + Deployment per agent, scale-to-zero sleep, delete on destroy). This
 * file is GATED on HOUSTON_GKE_TEST and pointed at the ambient kubeconfig
 * (`kind`, minikube, or a throwaway GKE namespace). With the gate unset it
 * self-skips with a one-line reason — it is NEVER faked green. The exact run
 * command (incl. a `kind` cluster + the tiny always-ready stub image) lives in
 * launcher/README-testing.md.
 *
 * What runs against the cluster:
 *   1. The SAME runRuntimeLauncherContract the FakeLauncher/ProcessLauncher pass
 *      (ensureAwake → running + reachable endpoint, idempotent re-wake, sleep →
 *      asleep, independent agents). This needs the agent pod to reach Ready, so
 *      CP_AGENT_IMAGE must serve GET /health 200 (the stub image in the README).
 *   2. An apiserver-object reconcile/idempotency suite that does NOT depend on a
 *      ready pod — it asserts each ensure* step creates its object, is a no-op on
 *      re-run (the 404→create / 409→exists control flow in reconcile.ts), and
 *      that status reports "absent" for an unknown agent and "asleep" after a
 *      scale-to-zero. This runs even with a stub/again image since it never waits
 *      for readiness.
 */

const ENABLED = process.env.HOUSTON_GKE_TEST === "1";

/** Real HMAC-free identity vault is overkill here; a deterministic stub suffices
 *  (the token only has to be a non-empty string the launcher stamps into env). */
const vault: CredentialVault = {
  sandboxToken: (workspaceId, agentId) => `tok-${workspaceId}-${agentId}`,
  validateSandboxToken: () => null,
};

/** A unique workspace slug per run so parallel/leftover runs never collide. */
const SLUG = `gketest-${process.pid}`;

const agentOf = (id: string): Agent => ({
  id,
  workspaceId: "gke-test-ws",
  name: id,
  createdAt: 0,
});

function makeLauncher(): RuntimeLauncher {
  const kc = new KubeConfig();
  kc.loadFromDefault();
  return new GkeLauncher({
    kubeConfig: kc,
    vault,
    // Both the agent passed to ensureAwake and any id passed to sleep/destroy/
    // status resolve to the same fixed workspace slug for this run.
    workspaceSlugFor: async () => SLUG,
    resolver: {
      resolve: async (agentId) => ({
        agent: agentOf(agentId),
        workspaceSlug: SLUG,
      }),
    },
    // The stub image becomes Ready in seconds; keep the cap small so a
    // misconfigured run fails fast instead of hanging the suite.
    readyTimeoutMs: Number(process.env.HOUSTON_GKE_READY_TIMEOUT_MS ?? 90_000),
    pollIntervalMs: 1_000,
  });
}

if (!ENABLED) {
  // Explicit, visible skip — the gap is recorded, not silently green.
  test.skip("GkeLauncher integration (set HOUSTON_GKE_TEST=1 + a kube context — see launcher/README-testing.md)", () => {});
} else {
  // 1) The shared RuntimeLauncher contract, verbatim, against the real launcher.
  runRuntimeLauncherContract("GkeLauncher (live cluster)", makeLauncher);

  // 2) Apiserver-object reconcile + idempotency, no pod-readiness dependency.
  describe("GkeLauncher reconcile against the apiserver (idempotent object lifecycle)", () => {
    const kc = new KubeConfig();
    let core: CoreV1Api;
    const launcher = makeLauncher();
    const ns = namespaceFor(SLUG);
    const agent = agentOf("recon-1");

    beforeAll(() => {
      kc.loadFromDefault();
      core = kc.makeApiClient(CoreV1Api);
    });

    afterAll(async () => {
      // Best-effort teardown of everything this suite created.
      await launcher.destroy(agent.id, { dropVolume: true }).catch(() => {});
      await core.deleteNamespace({ name: ns }).catch(() => {});
    });

    test("status of an unknown agent is 'absent' before anything is created", async () => {
      expect(await launcher.status("never-created")).toBe("absent");
    });

    test("each ensure* step creates its object and is a no-op on re-run", async () => {
      const apps = kc.makeApiClient(
        (await import("@kubernetes/client-node")).AppsV1Api,
      );
      const token = vault.sandboxToken(agent.workspaceId, agent.id);

      // Run twice — the second pass must not throw (404→create then read-hit).
      for (let pass = 0; pass < 2; pass++) {
        await ensureNamespace(core, SLUG);
        await ensurePvc(core, agent, SLUG);
        await ensureDeployment(apps, agent, SLUG, token);
        await ensureService(core, agent, SLUG);
      }

      // Every object now exists under the workspace namespace.
      await expect(core.readNamespace({ name: ns })).resolves.toBeDefined();
      await expect(
        core.readNamespacedPersistentVolumeClaim({
          name: pvcName(agent.id),
          namespace: ns,
        }),
      ).resolves.toBeDefined();
      await expect(
        core.readNamespacedService({
          name: serviceName(agent.id),
          namespace: ns,
        }),
      ).resolves.toBeDefined();
      await expect(
        apps.readNamespacedDeployment({
          name: deploymentName(agent.id),
          namespace: ns,
        }),
      ).resolves.toBeDefined();
    });

    test("sleep scales the deployment to zero → status 'asleep'", async () => {
      await launcher.sleep(agent.id);
      // status reads desired replicas; a scaled-to-zero deployment is "asleep"
      // regardless of whether the (stub) pod ever became ready.
      expect(await launcher.status(agent.id)).toBe("asleep");
    });

    test("destroy removes the deployment + service → status 'absent'", async () => {
      await launcher.destroy(agent.id);
      expect(await launcher.status(agent.id)).toBe("absent");
    });
  });
}
