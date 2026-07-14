/**
 * Whether the TS engine reports to Sentry, and with what identity — resolved
 * PURELY from the process environment so both engine processes (host and
 * runtime) and both runtimes (Node in pods/dev/self-host, the Bun-compiled
 * desktop sidecar) share ONE rule.
 *
 * The rule mirrors the desktop app's HOU-469 contract:
 * `dsn_present && (production_context || SENTRY_SEND_IN_DEV)`.
 *
 * - No `SENTRY_DSN` → dormant. The credential IS the switch: the desktop app
 *   injects the DSN into the sidecar only when its own gate passed, the
 *   engine-pod image bakes it at build, self-hosters set their own. Nothing
 *   is baked into source.
 * - A DSN in a DEV run (source-run via tsx/vitest — neither the compiled
 *   sidecar, nor NODE_ENV=production, nor a managed pod) is suppressed unless
 *   `SENTRY_SEND_IN_DEV` opts in, so a shell-exported prod DSN can't make
 *   `pnpm dev` pollute the prod Sentry project.
 */

export type EngineProcess = "host" | "runtime";

/** Where this engine is running — a Sentry tag, derived, never configured. */
export type EngineDeployment = "managed-cloud" | "desktop" | "selfhost" | "dev";

export interface EngineSentryConfig {
  dsn: string;
  /** `SENTRY_ENVIRONMENT` if injected, else derived from the deployment. */
  environment: string;
  /** `SENTRY_RELEASE` if injected (desktop: `houston-app@<version>`, pods: `engine-pod@<sha>`). */
  release?: string;
  deployment: EngineDeployment;
  /** Extra event tags (org/agent slugs on managed pods). */
  tags: Record<string, string>;
}

type Env = Record<string, string | undefined>;

/**
 * Truthy check for the `SENTRY_SEND_IN_DEV` opt-in. Accepts `1`, `true`,
 * `yes`, `on` (case-insensitive) — the same set the Rust shell accepts, so the
 * one flag means the same thing on every layer.
 */
export function sendInDevEnabled(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * The deployment this process runs in, from environment signals that already
 * exist for other reasons (nothing here is a feature flag):
 * - `HOUSTON_MANAGED_CLOUD=1` — the engine-pod image profile (cloud).
 * - `HOUSTON_SIDECAR_BINARY` — set by the compiled sidecar entry for itself
 *   and inherited by the runtimes it spawns (desktop).
 * - `NODE_ENV=production` — the self-host Docker image.
 * - anything else — a source run (pnpm dev, tsx, vitest).
 */
export function engineDeployment(env: Env): EngineDeployment {
  if (env.HOUSTON_MANAGED_CLOUD === "1") return "managed-cloud";
  if (env.HOUSTON_SIDECAR_BINARY) return "desktop";
  if (env.NODE_ENV === "production") return "selfhost";
  return "dev";
}

/**
 * Resolve the engine's Sentry config, or `undefined` when the engine must
 * stay dormant (no DSN, or a dev run without the opt-in).
 */
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
  // Managed pods carry their org/agent identity in env (set by the gateway's
  // pod spec) — stamping them as tags is what makes "whose agent hit this?"
  // answerable from the Sentry issue alone.
  if (env.HOUSTON_ORG_SLUG) tags.org_slug = env.HOUSTON_ORG_SLUG;
  if (env.HOUSTON_AGENT_SLUG) tags.agent_slug = env.HOUSTON_AGENT_SLUG;

  return {
    dsn,
    environment:
      env.SENTRY_ENVIRONMENT ||
      (deployment === "dev" ? "development" : "production"),
    release: env.SENTRY_RELEASE || undefined,
    deployment,
    tags,
  };
}
