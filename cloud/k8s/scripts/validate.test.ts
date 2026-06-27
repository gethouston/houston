import { expect, test } from "vitest";
import {
  DUMMY_VALUES,
  type ManifestDoc,
  render,
  stripComments,
  validateAll,
} from "./validate";

/** Find the first rendered doc of a given kind across all manifest files. */
function docOfKind(kind: string): ManifestDoc {
  for (const m of validateAll()) {
    const found = m.docs.find((d) => (d as ManifestDoc).kind === kind);
    if (found) return found;
  }
  throw new Error(`no rendered doc of kind ${kind}`);
}

function deep(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

test("every manifest parses, renders, and keeps no surviving placeholder", () => {
  const manifests = validateAll();
  expect(manifests.length).toBeGreaterThanOrEqual(6); // ns, sa, pvc, np, deploy, kustomization
  const files = manifests.map((m) => m.file);
  for (const f of [
    "agent-deployment.yaml",
    "kustomization.yaml",
    "namespace.yaml",
    "networkpolicy.yaml",
    "pvc.yaml",
    "serviceaccount.yaml",
  ]) {
    expect(files).toContain(f);
  }
});

test("render throws on an unknown placeholder (no silent skip)", () => {
  expect(() => render("name: {{NOPE}}", DUMMY_VALUES)).toThrow(
    /unknown placeholder/,
  );
});

test("render substitutes every known placeholder", () => {
  const out = render("a: {{WORKSPACE_NS}}\nb: {{AGENT_ID}}", DUMMY_VALUES);
  expect(out).toBe(
    `a: ${DUMMY_VALUES.WORKSPACE_NS}\nb: ${DUMMY_VALUES.AGENT_ID}`,
  );
  expect(out.includes("{{")).toBe(false);
});

test("stripComments drops comment text but keeps quoted '#' and real values", () => {
  // A `{{...}}` inside a comment is removed (so the lint ignores documentation).
  expect(stripComments("name: x  # carries {{FOO}}").includes("{{")).toBe(
    false,
  );
  // A real value survives, including a `#` inside a quoted scalar.
  expect(stripComments('key: "a#b"')).toBe('key: "a#b"');
  // A `#` with no preceding whitespace is not a comment (e.g. a URL fragment).
  expect(stripComments("url: http://x#frag")).toBe("url: http://x#frag");
});

test("agent Deployment runs under gVisor, non-root, with the keyless-proxy env", () => {
  const deploy = docOfKind("Deployment");
  const podSpec = deep(deploy, ["spec", "template", "spec"]) as Record<
    string,
    unknown
  >;

  // gVisor runtime — THIS is the §2 wall, not pi.
  expect(podSpec.runtimeClassName).toBe(DUMMY_VALUES.RUNTIME_CLASS);

  // Non-root pod securityContext.
  const podSec = podSpec.securityContext as Record<string, unknown>;
  expect(podSec.runAsNonRoot).toBe(true);

  // Single container, on the engine port, mounting /data from the PVC.
  const containers = podSpec.containers as Array<Record<string, unknown>>;
  expect(containers.length).toBe(1);
  const c = containers[0];
  if (c === undefined) throw new Error("containers[0] is undefined");
  const ports = c.ports as Array<Record<string, unknown>>;
  expect(ports[0]?.containerPort).toBe(4317);

  const mounts = c.volumeMounts as Array<Record<string, unknown>>;
  expect(mounts.some((m) => m.mountPath === "/data")).toBe(true);
  // readOnlyRootFilesystem demands writable /tmp scratch (emptyDir).
  expect(mounts.some((m) => m.mountPath === "/tmp")).toBe(true);
  const volumes = podSpec.volumes as Array<Record<string, unknown>>;
  const tmpVol = volumes.find((v) => v.name === "tmp");
  expect(tmpVol).toBeDefined();
  expect(tmpVol?.emptyDir).toBeDefined();

  // Container hardening.
  const cSec = c.securityContext as Record<string, unknown>;
  expect(cSec.allowPrivilegeEscalation).toBe(false);
  expect(cSec.readOnlyRootFilesystem).toBe(true);
  expect((cSec.capabilities as Record<string, unknown>).drop).toEqual(["ALL"]);

  // Probes on /health.
  expect(deep(c, ["readinessProbe", "httpGet", "path"])).toBe("/health");
  expect(deep(c, ["livenessProbe", "httpGet", "path"])).toBe("/health");

  // Keyless-proxy + engine env wiring.
  const env = c.env as Array<Record<string, unknown>>;
  const byName = new Map(env.map((e) => [e.name as string, e]));
  expect(byName.get("HOUSTON_CLOUD")?.value).toBe("1");
  expect(byName.get("HOUSTON_PROXY_BASE_URL")?.value).toBe(
    DUMMY_VALUES.PROXY_BASE_URL,
  );
  expect(byName.get("HOUSTON_HOST")?.value).toBe("0.0.0.0");
  expect(byName.get("HOUSTON_WORKSPACE_DIR")?.value).toBe("/data");

  // The sandbox token comes from a Secret, NEVER an inline real key.
  const tokenEnv = byName.get("HOUSTON_SANDBOX_TOKEN");
  if (tokenEnv === undefined)
    throw new Error("HOUSTON_SANDBOX_TOKEN env not found");
  expect("value" in tokenEnv).toBe(false);
  expect(deep(tokenEnv, ["valueFrom", "secretKeyRef", "name"])).toBe(
    `agent-${DUMMY_VALUES.AGENT_ID}-sandbox-token`,
  );
  // Inbound engine bearer also from a Secret.
  expect(
    deep(byName.get("HOUSTON_RUNTIME_TOKEN"), [
      "valueFrom",
      "secretKeyRef",
      "name",
    ]),
  ).toBe(`agent-${DUMMY_VALUES.AGENT_ID}-engine-token`);
});

test("NetworkPolicy is default-deny and blocks metadata + internal ranges on egress", () => {
  const np = docOfKind("NetworkPolicy");
  const spec = np.spec as Record<string, unknown>;

  // Default-deny: both policy types selected.
  expect(spec.policyTypes).toEqual(["Ingress", "Egress"]);

  // The public-internet egress rule must carve OUT metadata + internal ranges.
  const egress = spec.egress as Array<Record<string, unknown>>;
  const internetRule = egress.find((r) => {
    const to = (r.to as Array<Record<string, unknown>> | undefined) ?? [];
    return to.some((t) => deep(t, ["ipBlock", "cidr"]) === "0.0.0.0/0");
  });
  expect(internetRule).toBeDefined();
  const except = deep(internetRule, [
    "to",
    "0",
    "ipBlock",
    "except",
  ]) as string[];
  expect(except).toContain("169.254.169.254/32"); // GCP metadata endpoint
  expect(except).toContain(DUMMY_VALUES.POD_CIDR); // no agent->agent
  expect(except).toContain(DUMMY_VALUES.SERVICE_CIDR); // no internal Services
  expect(except).toContain("10.0.0.0/8"); // RFC-1918

  // Ingress is allowed only from the control plane control-plane namespace.
  const ingress = spec.ingress as Array<Record<string, unknown>>;
  const fromControlPlane = deep(ingress[0], [
    "from",
    "0",
    "namespaceSelector",
    "matchLabels",
  ]) as Record<string, unknown>;
  expect(fromControlPlane["houston.ai/component"]).toBe("control-plane");
});

test("ServiceAccount carries the Workload Identity annotation", () => {
  const sa = validateAll()
    .flatMap((m) => m.docs)
    .find(
      (d) =>
        d.kind === "ServiceAccount" &&
        deep(d, [
          "metadata",
          "annotations",
          "iam.gke.io/gcp-service-account",
        ]) === DUMMY_VALUES.GCP_SA,
    );
  expect(sa).toBeDefined();
});

test("PVC is ReadWriteOnce (single writer = isolation)", () => {
  const pvc = docOfKind("PersistentVolumeClaim");
  expect(deep(pvc, ["spec", "accessModes"])).toEqual(["ReadWriteOnce"]);
});

test("Namespace enforces the restricted Pod Security profile", () => {
  const ns = validateAll()
    .flatMap((m) => m.docs)
    .find(
      (d) =>
        d.kind === "Namespace" &&
        deep(d, [
          "metadata",
          "labels",
          "pod-security.kubernetes.io/enforce",
        ]) === "restricted",
    );
  expect(ns).toBeDefined();
});
