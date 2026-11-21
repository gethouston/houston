export type EngineProcess = "host" | "runtime";

export type EngineDeployment = "managed-cloud" | "desktop" | "selfhost" | "dev";

export interface EngineSentryConfig {
  dsn: string;
  environment: string;
  release?: string;
  deployment: EngineDeployment;
  tags: Record<string, string>;
  user?: { id?: string; email?: string; username?: string };
}

type Env = Record<string, string | undefined>;

export function sendInDevEnabled(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function engineDeployment(env: Env): EngineDeployment {
  if (env.HOUSTON_MANAGED_CLOUD === "1") return "managed-cloud";
  if (env.HOUSTON_SIDECAR_BINARY) return "desktop";
  if (env.NODE_ENV === "production") return "selfhost";
  return "dev";
}

export function resolveEngineSentryConfig(
  env: Env,
): EngineSentryConfig | undefined {
  const dsn = env.SENTRY_DSN;
  if (!dsn) return undefined;

  const deployment = engineDeployment(env);
  if (deployment === "dev" && !sendInDevEnabled(env.SENTRY_SEND_IN_DEV)) {
    return undefined;
  }

  const tags: Record<string, string> = {};
  if (env.HOUSTON_ORG_SLUG) tags.org_slug = env.HOUSTON_ORG_SLUG;
  if (env.HOUSTON_AGENT_SLUG) tags.agent_slug = env.HOUSTON_AGENT_SLUG;

  const release = env.SENTRY_RELEASE || undefined;
  const at = release ? release.indexOf("@") : -1;
  if (release && at > 0 && at < release.length - 1) {
    tags.engine_version = release.slice(at + 1);
  }

  const user: EngineSentryConfig["user"] = {};
  if (env.HOUSTON_USER_ID) user.id = env.HOUSTON_USER_ID;
  if (env.HOUSTON_USER_EMAIL) user.email = env.HOUSTON_USER_EMAIL;
  if (env.HOUSTON_USER_NAME) user.username = env.HOUSTON_USER_NAME;

  return {
    dsn,
    environment:
      env.SENTRY_ENVIRONMENT ||
      (deployment === "dev" ? "development" : "production"),
    release,
    deployment,
    tags,
    user: Object.keys(user).length ? user : undefined,
  };
}
