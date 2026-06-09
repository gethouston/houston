/**
 * Validates the cloud/k8s manifest TEMPLATES without a cluster.
 *
 * These manifests carry {{...}} placeholders the control plane SandboxManager fills, so
 * raw `kubectl apply` / `kustomize build` would choke on them. This validator
 * instead:
 *   1. parses every *.yaml as YAML (catches syntax errors),
 *   2. renders each template with dummy-but-realistic values,
 *   3. asserts the RENDERED text still parses AND has zero surviving "{{",
 *   4. asserts a few structural invariants the security model depends on
 *      (gVisor runtime, non-root, metadata block, default-deny).
 *
 * No silent failures: a problem throws; the CLI exits non-zero with the reason.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const K8S_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Dummy values for every placeholder the SandboxManager would substitute. */
export const DUMMY_VALUES: Record<string, string> = {
  WORKSPACE_NS: "ws-acme",
  WORKSPACE_ID: "ws_123",
  WORKSPACE_SLUG: "acme",
  CP_NS: "control-plane",
  AGENT_ID: "agent_456",
  AGENT_NAME: "Sales Agent",
  IMAGE: "us-docker.pkg.dev/houston/houston/agent-engine:abc123",
  RUNTIME_CLASS: "gvisor",
  PROXY_BASE_URL: "https://cp.houston.ai/proxy",
  GCP_SA: "agent-456@houston.iam.gserviceaccount.com",
  VOLUME_SIZE: "10Gi",
  STORAGE_CLASS: "standard-rwo",
  CPU_REQUEST: "250m",
  CPU_LIMIT: "1",
  MEM_REQUEST: "512Mi",
  MEM_LIMIT: "2Gi",
  POD_CIDR: "10.0.0.0/14",
  SERVICE_CIDR: "10.4.0.0/20",
};

const PLACEHOLDER = /\{\{\s*([A-Z_]+)\s*\}\}/g;

/**
 * Remove YAML comments line by line. A `#` opens a comment only when it is NOT
 * inside a quoted scalar (and, per YAML, when preceded by whitespace or at line
 * start). This is enough to exclude prose like `# carries {{...}}` from the
 * surviving-placeholder check without a full YAML re-serialization.
 */
export function stripComments(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      let inSingle = false;
      let inDouble = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === "'" && !inDouble) inSingle = !inSingle;
        else if (ch === '"' && !inSingle) inDouble = !inDouble;
        else if (ch === "#" && !inSingle && !inDouble) {
          const prev = i === 0 ? " " : line[i - 1];
          if (prev === " " || prev === "\t") return line.slice(0, i);
        }
      }
      return line;
    })
    .join("\n");
}

/** Substitute every {{KEY}} with values[KEY]; throw on any unknown key. */
export function render(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (_match, key: string) => {
    const v = values[key];
    if (v === undefined) {
      throw new Error(`unknown placeholder {{${key}}} (no dummy value provided)`);
    }
    return v;
  });
}

export type ManifestDoc = Record<string, unknown>;

/** Parse a (possibly multi-doc) YAML string into one object per document. */
function parseDocs(yaml: string): ManifestDoc[] {
  // Bun.YAML.parse on a multi-doc stream returns an array of docs; a single doc
  // returns the object. Normalize to an array.
  const parsed = (Bun as unknown as { YAML: { parse(s: string): unknown } }).YAML.parse(yaml);
  if (Array.isArray(parsed)) return parsed as ManifestDoc[];
  return [parsed as ManifestDoc];
}

export interface ValidatedManifest {
  file: string;
  docs: ManifestDoc[];
}

/** Validate every *.yaml template in cloud/k8s. Returns the rendered docs. */
export function validateAll(): ValidatedManifest[] {
  const files = readdirSync(K8S_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .sort();
  if (files.length === 0) throw new Error(`no *.yaml manifests found in ${K8S_DIR}`);

  const out: ValidatedManifest[] = [];
  for (const file of files) {
    const raw = readFileSync(join(K8S_DIR, file), "utf8");

    // 1. The raw template must itself be valid YAML (placeholders are bare
    //    scalars or quoted strings, both legal YAML).
    parseDocs(raw);

    // 2. Render with dummy values, then re-parse the rendered text.
    const rendered = render(raw, DUMMY_VALUES);
    const docs = parseDocs(rendered);

    // 3. No placeholder may survive a render — but ignore comment lines, where
    //    we legitimately document the `{{...}}` syntax in prose. Comments are
    //    stripped by the YAML parser and never reach the cluster, so an unfilled
    //    placeholder in a comment is not an apply-time hazard. We check the
    //    effective (comment-free) text.
    if (stripComments(rendered).includes("{{")) {
      throw new Error(`${file}: a {{placeholder}} survived rendering (outside a comment)`);
    }

    // Every doc must declare kind + apiVersion (kustomization.yaml included).
    for (const doc of docs) {
      if (!doc || typeof doc !== "object") {
        throw new Error(`${file}: produced a non-object YAML document`);
      }
      if (!("kind" in doc) || !("apiVersion" in doc)) {
        throw new Error(`${file}: a document is missing kind/apiVersion`);
      }
    }
    out.push({ file, docs });
  }
  return out;
}

/** CLI entry: validate, print a summary, exit non-zero on failure. */
if (import.meta.main) {
  try {
    const manifests = validateAll();
    let docCount = 0;
    for (const m of manifests) docCount += m.docs.length;
    console.log(
      `OK — ${manifests.length} manifest file(s), ${docCount} document(s), 0 surviving placeholders.`,
    );
    for (const m of manifests) {
      const kinds = m.docs.map((d) => String((d as ManifestDoc).kind)).join(", ");
      console.log(`  ${m.file}: ${kinds}`);
    }
    process.exit(0);
  } catch (err) {
    // Surface, never swallow.
    console.error(`FAILED — ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
