// K8s REST primitives used by provision-tenant.
//
// We talk to the API server directly because the Supabase Edge runtime
// doesn't have kubectl or helm. Deno's fetch trusts the system root store;
// kind's API server presents a self-signed cert, so we inject the cluster
// CA into a custom http client and use it for every call.

const K8S_API_URL = mustEnv("K8S_API_URL");
const K8S_TOKEN = mustEnv("K8S_TOKEN");
const K8S_CA_CERT_B64 = mustEnv("K8S_CA_CERT_B64");
// Fail-fast on missing ENGINE_IMAGE — the prior silent fallback to
// `:latest` masked typos like `ENGIN_IMAGE=...` and meant tenants
// drifted versions every time the image was re-tagged. Operators
// must pin a digest or tag explicitly in the env file.
const ENGINE_IMAGE = mustEnv("ENGINE_IMAGE");

const k8sCa = atob(K8S_CA_CERT_B64);
const k8sClient = Deno.createHttpClient({ caCerts: [k8sCa] });

function mustEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing env var: ${name}`);
  return v;
}

async function k8s(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${K8S_API_URL}${path}`, {
    ...init,
    client: k8sClient,
    headers: {
      Authorization: `Bearer ${K8S_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  // 409 = AlreadyExists. Idempotent for our re-provisioning case.
  if (!res.ok && res.status !== 409) {
    const body = await res.text();
    throw new Error(`k8s ${init.method ?? "GET"} ${path} -> ${res.status}: ${body}`);
  }
  return res;
}

export async function createNamespace(name: string): Promise<void> {
  await k8s("/api/v1/namespaces", {
    method: "POST",
    body: JSON.stringify({
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        name,
        labels: { "app.kubernetes.io/managed-by": "provision-tenant" },
      },
    }),
  });
}

/**
 * Idempotent: if the secret already exists (409), return its existing
 * token instead of trying to replace it. The running pod has the old
 * token baked into its env at start, so updating the secret value
 * wouldn't reach the process anyway — and a *different* token written
 * to the tenants row would break the webapp permanently. Always reflect
 * the secret's actual value back to the caller.
 */
export async function createTokenSecret(ns: string, token: string): Promise<string> {
  const res = await k8s(`/api/v1/namespaces/${ns}/secrets`, {
    method: "POST",
    body: JSON.stringify({
      apiVersion: "v1",
      kind: "Secret",
      metadata: { name: "engine-token" },
      type: "Opaque",
      stringData: { HOUSTON_ENGINE_TOKEN: token },
    }),
  });
  if (res.status === 409) {
    const existing = await k8s(`/api/v1/namespaces/${ns}/secrets/engine-token`);
    const body = await existing.json() as { data?: { HOUSTON_ENGINE_TOKEN?: string } };
    const b64 = body.data?.HOUSTON_ENGINE_TOKEN;
    if (!b64) throw new Error("existing engine-token secret has no HOUSTON_ENGINE_TOKEN key");
    return atob(b64);
  }
  return token;
}

export async function createEngineDeployment(ns: string): Promise<void> {
  await k8s(`/apis/apps/v1/namespaces/${ns}/deployments`, {
    method: "POST",
    body: JSON.stringify({
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: "engine", labels: { app: "engine" } },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: "engine" } },
        template: {
          metadata: { labels: { app: "engine" } },
          spec: {
            containers: [{
              name: "engine",
              image: ENGINE_IMAGE,
              imagePullPolicy: "IfNotPresent",
              ports: [{ name: "http", containerPort: 7777 }],
              env: [
                { name: "HOUSTON_BIND", value: "0.0.0.0:7777" },
                { name: "HOUSTON_BIND_ALL", value: "1" },
                { name: "HOUSTON_NO_PARENT_WATCHDOG", value: "1" },
                {
                  name: "HOUSTON_ENGINE_TOKEN",
                  valueFrom: {
                    secretKeyRef: { name: "engine-token", key: "HOUSTON_ENGINE_TOKEN" },
                  },
                },
                { name: "RUST_LOG", value: "info,houston=debug" },
              ],
              resources: {
                requests: { cpu: "250m", memory: "256Mi" },
                limits: { cpu: "1", memory: "1Gi" },
              },
            }],
          },
        },
      },
    }),
  });
}

export async function createEngineService(ns: string): Promise<void> {
  await k8s(`/api/v1/namespaces/${ns}/services`, {
    method: "POST",
    body: JSON.stringify({
      apiVersion: "v1",
      kind: "Service",
      metadata: { name: "engine" },
      spec: {
        type: "ClusterIP",
        selector: { app: "engine" },
        ports: [{ name: "http", port: 7777, targetPort: "http" }],
      },
    }),
  });
}
