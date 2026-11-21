export interface IdentityConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
}

function devEnv(key: string): string {
  const env = import.meta.env as Record<string, string | undefined> | undefined;
  return env?.[key]?.trim() ?? "";
}

export function resolveIdentityConfig(sources: {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  devApiKey?: string;
  devAuthDomain?: string;
  devProjectId?: string;
}): IdentityConfig {
  return {
    apiKey: (sources.apiKey || sources.devApiKey || "").trim(),
    authDomain: (sources.authDomain || sources.devAuthDomain || "").trim(),
    projectId: (sources.projectId || sources.devProjectId || "").trim(),
  };
}

export function identityConfigured(config: IdentityConfig): boolean {
  return Boolean(config.apiKey && config.projectId);
}

export const identityConfig: IdentityConfig = resolveIdentityConfig({
  apiKey:
    typeof __FIREBASE_API_KEY__ !== "undefined" ? __FIREBASE_API_KEY__ : "",
  authDomain:
    typeof __FIREBASE_AUTH_DOMAIN__ !== "undefined"
      ? __FIREBASE_AUTH_DOMAIN__
      : "",
  projectId:
    typeof __FIREBASE_PROJECT_ID__ !== "undefined"
      ? __FIREBASE_PROJECT_ID__
      : "",
  devApiKey: devEnv("VITE_FIREBASE_API_KEY"),
  devAuthDomain: devEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  devProjectId: devEnv("VITE_FIREBASE_PROJECT_ID"),
});

export function isIdentityConfigured(): boolean {
  return identityConfigured(identityConfig);
}
