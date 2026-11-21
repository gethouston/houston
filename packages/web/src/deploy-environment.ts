export type DeployEnvironment = "production" | "preview" | "development";

export function classifyDeployEnvironment(hostname: string): DeployEnvironment {
  const host = hostname.toLowerCase();

  if (host === "app.gethouston.ai") return "production";

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]"
  ) {
    return "development";
  }

  return "preview";
}

export function currentDeployEnvironment(): DeployEnvironment {
  if (typeof window === "undefined") return "development";
  return classifyDeployEnvironment(window.location.hostname);
}

export function bootDeployEnvironment(
  preset: DeployEnvironment | undefined,
  hostname: string,
): DeployEnvironment {
  return preset ?? classifyDeployEnvironment(hostname);
}
