import type {
  V1Deployment,
  V1Namespace,
  V1PersistentVolumeClaim,
  V1Service,
} from "@kubernetes/client-node";
import type { Agent } from "../domain/types";
import { config } from "../config";
import {
  agentLabels,
  deploymentName,
  enginePort,
  MANAGED_BY_LABEL,
  MANAGED_BY_VALUE,
  namespaceFor,
  pvcName,
  serviceName,
} from "./names";

/**
 * Pure builders for the K8s objects backing one agent sandbox. All typed
 * against @kubernetes/client-node models so the apiserver shape is checked at
 * compile time; no YAML templating, no string interpolation of specs.
 *
 * `sandboxToken` is the control plane-issued token the runtime enforces as its
 * inbound Bearer (HOUSTON_RUNTIME_TOKEN) — so only the control-plane proxy can
 * reach the pod. The user's own AI subscription is connected in-pod via device
 * code and persists to auth.json on the PVC; no provider key enters the spec.
 */

const DATA_MOUNT = "/data";
const WORKSPACE_DIR = "/data/workspace";

export function buildNamespace(workspaceSlug: string): V1Namespace {
  return {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
      name: namespaceFor(workspaceSlug),
      labels: { [MANAGED_BY_LABEL]: MANAGED_BY_VALUE },
    },
  };
}

export function buildPvc(
  agent: Agent,
  workspaceSlug: string,
): V1PersistentVolumeClaim {
  return {
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: {
      name: pvcName(agent.id),
      namespace: namespaceFor(workspaceSlug),
      labels: agentLabels(agent),
    },
    spec: {
      accessModes: ["ReadWriteOnce"],
      resources: { requests: { storage: "10Gi" } },
    },
  };
}

export function buildDeployment(
  agent: Agent,
  workspaceSlug: string,
  sandboxToken: string,
): V1Deployment {
  const labels = agentLabels(agent);
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      name: deploymentName(agent.id),
      namespace: namespaceFor(workspaceSlug),
      labels,
    },
    spec: {
      replicas: 1,
      selector: { matchLabels: labels },
      // The agent's data is a ReadWriteOnce PVC only one pod may mount at a time.
      // Recreate (not the default RollingUpdate) stops the old pod before starting
      // the new one, so a wake/rollout can't deadlock on a volume Multi-Attach.
      strategy: { type: "Recreate" },
      template: {
        metadata: { labels },
        spec: {
          // Omit when empty so the pod schedules on a cluster without a custom
          // RuntimeClass (gVisor/Kata is a hardening follow-up). An empty string
          // is an invalid runtimeClassName and would block scheduling.
          runtimeClassName: config.runtimeClass || undefined,
          automountServiceAccountToken: false,
          // Run as the image's non-root bun user (uid 1000) and fsGroup-own the
          // volume, so the freshly-provisioned /data PVC is writable on first
          // mount (otherwise the runtime's mkdir at startup crash-loops). Also
          // satisfies GKE Autopilot's restricted PodSecurity.
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 1000,
            runAsGroup: 1000,
            fsGroup: 1000,
            seccompProfile: { type: "RuntimeDefault" },
          },
          volumes: [
            {
              name: "data",
              persistentVolumeClaim: { claimName: pvcName(agent.id) },
            },
          ],
          containers: [
            {
              name: "runtime",
              image: config.agentImage,
              ports: [{ name: "engine", containerPort: enginePort }],
              env: [
                // Subscription mode: the user connects their OWN Codex/Claude
                // subscription via pi's device-code OAuth in-pod. The token persists
                // to auth.json under HOUSTON_DATA_DIR (the PVC mount), so it survives
                // sleep/wake. HOUSTON_RUNTIME_TOKEN makes the runtime enforce the
                // control-plane's Bearer; HOUSTON_PORT is what config.ts actually reads.
                { name: "HOUSTON_HOST", value: "0.0.0.0" },
                { name: "HOUSTON_WORKSPACE_DIR", value: WORKSPACE_DIR },
                { name: "HOUSTON_DATA_DIR", value: DATA_MOUNT },
                { name: "HOUSTON_RUNTIME_TOKEN", value: sandboxToken },
                { name: "HOUSTON_PORT", value: String(enginePort) },
                // Connect-once: the same HMAC token proves "workspace W's agent A" to
                // the control plane, and the in-cluster URL is where the runtime serves
                // its workspace's central subscription token per turn. Omitting the URL
                // (no CP_INTERNAL_URL) leaves the agent on its own local credential.
                { name: "HOUSTON_SANDBOX_TOKEN", value: sandboxToken },
                {
                  name: "HOUSTON_CONTROL_PLANE_URL",
                  value: config.controlPlaneInternalUrl,
                },
              ],
              volumeMounts: [{ name: "data", mountPath: DATA_MOUNT }],
              // Cold Bun start on Autopilot bundles node scale-up + a ~120MB image
              // pull, so give readiness real headroom before it counts failures.
              readinessProbe: {
                httpGet: { path: "/health", port: enginePort },
                initialDelaySeconds: 5,
                periodSeconds: 5,
                timeoutSeconds: 3,
                failureThreshold: 12,
              },
              securityContext: {
                allowPrivilegeEscalation: false,
                capabilities: { drop: ["ALL"] },
              },
              resources: {
                requests: { cpu: "250m", memory: "512Mi" },
                limits: { cpu: "1", memory: "2Gi" },
              },
            },
          ],
        },
      },
    },
  };
}

export function buildService(agent: Agent, workspaceSlug: string): V1Service {
  const labels = agentLabels(agent);
  return {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name: serviceName(agent.id),
      namespace: namespaceFor(workspaceSlug),
      labels,
    },
    spec: {
      type: "ClusterIP",
      selector: labels,
      ports: [{ name: "engine", port: enginePort, targetPort: enginePort }],
    },
  };
}

/** Scale body for the AppsV1 deployment-scale subresource. */
export function buildScale(replicas: number): { spec: { replicas: number } } {
  return { spec: { replicas } };
}
