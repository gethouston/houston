export const config = {
  host: process.env.CP_HOST || "127.0.0.1",
  port: Number(process.env.CP_PORT || 8080),

  dev: process.env.CP_DEV === "1",

  supabaseJwksUrl: process.env.CP_SUPABASE_JWKS_URL || "",
  supabaseJwtSecret: process.env.CP_SUPABASE_JWT_SECRET || "",
  supabaseJwtIssuer: process.env.CP_SUPABASE_JWT_ISSUER || "",

  databaseUrl: process.env.CP_DATABASE_URL || "",

  namespacePrefix: process.env.CP_NAMESPACE_PREFIX || "ws-",
  agentImage: process.env.CP_AGENT_IMAGE || "",
  runtimeClass: process.env.CP_RUNTIME_CLASS || "",

  sandboxTokenSecret:
    process.env.CP_SANDBOX_TOKEN_SECRET || "dev-insecure-sandbox-secret",

  controlPlaneInternalUrl: process.env.CP_INTERNAL_URL || "",

  turnRuntimeUrl: process.env.CP_TURN_RUNTIME_URL || "",
  turnToken: process.env.CP_TURN_TOKEN || "",
  gcsBucket: process.env.CP_GCS_BUCKET || "",
  defaultRuntime:
    process.env.CP_DEFAULT_RUNTIME === "gke"
      ? ("gke" as const)
      : ("cloudrun" as const),
  turnsPerHour: Number(process.env.CP_TURNS_PER_HOUR || 120),
  turnMaxConcurrent: Number(process.env.CP_TURN_MAX_CONCURRENT || 3),
  codexModels: (
    process.env.CP_CODEX_MODELS ||
    "gpt-6-luna,gpt-6.1-terra,gpt-6-sol,gpt-6.1-sol,gpt-6.2-sol,gpt-6-astra,gpt-6.2-astra"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  corsOrigin: process.env.CP_CORS_ORIGIN || "*",

  redisUrl: process.env.CP_REDIS_URL || "",

  serviceTokens: process.env.CP_SERVICE_TOKENS || "",

  linearApiKey: process.env.CP_LINEAR_API_KEY || "",
  linearTeamId: process.env.CP_LINEAR_TEAM_ID || "",
  linearBugLabelName: process.env.CP_LINEAR_BUG_LABEL_NAME || "User Bug",

  adminUserIds: (process.env.CP_ADMIN_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  rateVcpuHourUsd: Number(process.env.CP_RATE_VCPU_HOUR || 0.0445),
  rateMemGiBHourUsd: Number(process.env.CP_RATE_MEM_GIB_HOUR || 0.0049),
  ratePdGiBMonthUsd: Number(process.env.CP_RATE_PD_GIB_MONTH || 0.1),
  rateClusterHourUsd: Number(process.env.CP_RATE_CLUSTER_HOUR || 0.1),

  gcpProject: process.env.CP_GCP_PROJECT || "",
  billingBqTable: process.env.CP_BILLING_BQ_TABLE || "",
  billingBqLocation: process.env.CP_BILLING_BQ_LOCATION || "US",
} as const;

export type Config = typeof config;
