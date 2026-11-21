export type CopilotLoginTarget =
  | { kind: "github_com" }
  | { kind: "enterprise"; domain: string }
  | { kind: "invalid" };

export function resolveCopilotDomain(input: string): CopilotLoginTarget {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "invalid" };
  let hostname: string;
  try {
    const url = trimmed.includes("://")
      ? new URL(trimmed)
      : new URL(`https://${trimmed}`);
    hostname = url.hostname;
  } catch {
    return { kind: "invalid" };
  }
  if (hostname === "github.com" || hostname === "www.github.com")
    return { kind: "github_com" };
  if (!hostname.includes(".")) return { kind: "invalid" };
  return { kind: "enterprise", domain: hostname };
}
