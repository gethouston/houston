/**
 * control plane (cloud control plane) configuration. All secrets come from env, never
 * literals. `dev` mode swaps the live adapters (Postgres, GKE, Supabase) for
 * in-memory / fake ones so the control plane boots and is testable with zero cloud deps.
 */
export const config = {
  host: process.env.CP_HOST || "127.0.0.1",
  port: Number(process.env.CP_PORT || 8080),

  /** Swap live adapters (Postgres / GKE / Supabase) for in-memory fakes. */
  dev: process.env.CP_DEV === "1",

  /** Supabase JWT verification: a JWKS URL (RS256) or a shared secret (HS256). */
  supabaseJwksUrl: process.env.CP_SUPABASE_JWKS_URL || "",
  supabaseJwtSecret: process.env.CP_SUPABASE_JWT_SECRET || "",
  supabaseJwtIssuer: process.env.CP_SUPABASE_JWT_ISSUER || "",

  /** Postgres (RBAC + audit). */
  databaseUrl: process.env.CP_DATABASE_URL || "",

  /** GKE: each workspace's agents live in its own namespace `<prefix><workspace-slug>`. */
  namespacePrefix: process.env.CP_NAMESPACE_PREFIX || "ws-",
  agentImage: process.env.CP_AGENT_IMAGE || "",
  /** gVisor/Kata is opt-in hardening (CP_RUNTIME_CLASS=gvisor). Empty = the cluster's
   *  default runtime, so a first sandbox schedules even without the Sandbox add-on. */
  runtimeClass: process.env.CP_RUNTIME_CLASS || "",

  /** Signs the non-secret sandbox tokens agents present to /sandbox/credential. */
  sandboxTokenSecret: process.env.CP_SANDBOX_TOKEN_SECRET || "dev-insecure-sandbox-secret",

  /** Minutes of inactivity before an agent's sandbox is slept (scale to zero). */
  idleSleepMinutes: Number(process.env.CP_IDLE_SLEEP_MINUTES || 10),

  /** In-cluster URL sandboxes call to serve their workspace's central credential (connect-once). */
  controlPlaneInternalUrl: process.env.CP_INTERNAL_URL || "",

  /**
   * Per-turn Cloud Run hosting (the cloudrun workspace runtime). When
   * CP_TURN_RUNTIME_URL is set, workspaces with runtime="cloudrun" dispatch
   * turns to it instead of a GKE pod: one self-contained POST /turn per turn,
   * GCS-prefix workspaces, scale-to-zero. The GKE path stays for runtime="gke"
   * workspaces until the PVC→GCS migration retires it.
   */
  turnRuntimeUrl: process.env.CP_TURN_RUNTIME_URL || "",
  /** App-layer token sent to the turn runtime in X-Internal-Token. */
  turnToken: process.env.CP_TURN_TOKEN || "",
  /** GCS bucket holding cloudrun workspaces (must match the runtime's HOUSTON_GCS_BUCKET). */
  gcsBucket: process.env.CP_GCS_BUCKET || "",
  /** Runtime for NEWLY-created workspaces: "cloudrun" (default) or "gke". */
  defaultRuntime: process.env.CP_DEFAULT_RUNTIME === "gke" ? ("gke" as const) : ("cloudrun" as const),
  /** Per-workspace turn budget (availability: one tenant can't hog the fleet). */
  turnsPerHour: Number(process.env.CP_TURNS_PER_HOUR || 120),
  turnMaxConcurrent: Number(process.env.CP_TURN_MAX_CONCURRENT || 3),
  /** Codex model ids offered in the model picker (the cloud is OpenAI/Codex-only). */
  codexModels: (process.env.CP_CODEX_MODELS || "gpt-5.5,gpt-5.5-codex,gpt-5.1")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  corsOrigin: process.env.CP_CORS_ORIGIN || "*",

  /**
   * Shared turn-state bus. Unset = in-process (single replica, the default).
   * Set to a Redis URL (Memorystore) and the relay/quota/connect state is
   * shared, which is what allows `replicas: 2+` on the control plane.
   */
  redisUrl: process.env.CP_REDIS_URL || "",

  /**
   * Static service tokens for unattended callers (nightly evals): a
   * comma-separated `<token>=<userId>` map. Each token authenticates as that
   * user through the normal authz path (own workspace only). Empty = off.
   */
  serviceTokens: process.env.CP_SERVICE_TOKENS || "",

  /**
   * "Send feedback" intake (web build → Linear). Same Linear team/label the
   * desktop app files to; unset = POST /feedback answers 503 and the dialog
   * surfaces "not configured" instead of silently dropping the report.
   */
  linearApiKey: process.env.CP_LINEAR_API_KEY || "",
  linearTeamId: process.env.CP_LINEAR_TEAM_ID || "",
  linearBugLabelName: process.env.CP_LINEAR_BUG_LABEL_NAME || "User Bug",

  /**
   * Operator dashboard (`/admin/*`). Only these Supabase user ids (the JWT `sub`)
   * may read the cross-tenant pod + spend views. Empty = the admin API is OFF
   * (every `/admin/*` request 403s) — it never falls open. Comma-separated.
   */
  adminUserIds: (process.env.CP_ADMIN_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  /**
   * Live cost ESTIMATE rates (USD). GKE Autopilot bills on Pod resource *requests*,
   * so burn rate = Σ(running-pod requests) × these. Defaults are the published
   * us-central1 list prices (us-east1 SKUs exist separately but track the same to
   * within a fraction of a cent); override per region. The estimate is approximate
   * by construction — BigQuery actuals (below) are the authoritative number.
   */
  rateVcpuHourUsd: Number(process.env.CP_RATE_VCPU_HOUR || 0.0445),
  rateMemGiBHourUsd: Number(process.env.CP_RATE_MEM_GIB_HOUR || 0.0049),
  /** Per-GiB-month for the balanced PD backing each agent PVC (storage = standing cost). */
  ratePdGiBMonthUsd: Number(process.env.CP_RATE_PD_GIB_MONTH || 0.1),
  /** Flat GKE cluster-management fee, shown so totals reconcile (offset by the free tier). */
  rateClusterHourUsd: Number(process.env.CP_RATE_CLUSTER_HOUR || 0.1),

  /**
   * Authoritative billed cost (optional). When CP_BILLING_BQ_TABLE is set, the
   * admin billing view also queries the BigQuery Cloud Billing *detailed* export,
   * grouped by the GKE cost-allocation `k8s-namespace` label, for per-user dollars.
   * Needs: detailed billing export + GKE cost allocation enabled, and the control
   * plane's GSA granted bigquery.jobUser + dataViewer (see cloud/billing.md).
   * Unset = the view shows the estimate only, with a "not configured" note.
   */
  gcpProject: process.env.CP_GCP_PROJECT || "",
  /** Fully-qualified detailed-export table: `project.dataset.gcp_billing_export_resource_v1_XXXX`. */
  billingBqTable: process.env.CP_BILLING_BQ_TABLE || "",
  /** Dataset region the query job must run in (must match the export dataset). */
  billingBqLocation: process.env.CP_BILLING_BQ_LOCATION || "US",
} as const;

export type Config = typeof config;
