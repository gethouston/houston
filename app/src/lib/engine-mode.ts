type EngineModeEnv = {
  VITE_NEW_ENGINE_URL?: string;
  VITE_HOSTED_ENGINE_URL?: string;
  VITE_HOSTED_ENGINE_AUTH?: string;
};

export function isLoopbackHostUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return (
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "[::1]" ||
      host === "::1"
    );
  } catch {
    return false;
  }
}

export function providerLoginUsesDeviceAuthByDefault(
  env: Pick<EngineModeEnv, "VITE_NEW_ENGINE_URL" | "VITE_HOSTED_ENGINE_URL">,
  client: { isTauri: boolean },
): boolean {
  if (!client.isTauri) return true;
  if (env.VITE_HOSTED_ENGINE_URL)
    return !isLoopbackHostUrl(env.VITE_HOSTED_ENGINE_URL);
  if (env.VITE_NEW_ENGINE_URL)
    return !isLoopbackHostUrl(env.VITE_NEW_ENGINE_URL);
  return false;
}

export function codexUsesLoopbackRelay(
  env: Pick<EngineModeEnv, "VITE_NEW_ENGINE_URL" | "VITE_HOSTED_ENGINE_URL">,
  client: { isTauri: boolean },
): boolean {
  return client.isTauri && providerLoginUsesDeviceAuthByDefault(env, client);
}

export type HostedAuthMode = "oauth" | "static";

export function hostedAuthMode(env: EngineModeEnv): HostedAuthMode {
  const raw = (env.VITE_HOSTED_ENGINE_AUTH ?? "").trim().toLowerCase();
  if (["oauth", "supabase", "google", "1", "true", "on"].includes(raw)) {
    return "oauth";
  }
  if (["static", "token", "none", "0", "false", "off"].includes(raw)) {
    return "static";
  }
  return env.VITE_HOSTED_ENGINE_URL ? "oauth" : "static";
}

export function hostedOauthLoginActive(env: EngineModeEnv): boolean {
  return Boolean(env.VITE_HOSTED_ENGINE_URL) && hostedAuthMode(env) === "oauth";
}

export type HostedGateState = "misconfigured" | "loading" | "sign-in" | "ready";

export function hostedGateState(input: {
  authConfigured: boolean;
  sessionLoading: boolean;
  hasSession: boolean;
  engineReady: boolean;
}): HostedGateState {
  if (!input.authConfigured) return "misconfigured";
  if (input.sessionLoading) return "loading";
  if (!input.hasSession) return "sign-in";
  if (!input.engineReady) return "loading";
  return "ready";
}

export type ResolvedEngine =
  | { kind: "static-host"; url: string }
  | { kind: "hosted-oauth"; url: string }
  | { kind: "hosted-static"; url: string }
  | { kind: "sidecar" };

export function resolveEngine(env: EngineModeEnv): ResolvedEngine {
  const staticHost = env.VITE_NEW_ENGINE_URL?.trim();
  if (staticHost) return { kind: "static-host", url: staticHost };
  const hosted = env.VITE_HOSTED_ENGINE_URL?.trim();
  if (hosted) {
    return hostedAuthMode(env) === "oauth"
      ? { kind: "hosted-oauth", url: hosted }
      : { kind: "hosted-static", url: hosted };
  }
  return { kind: "sidecar" };
}
