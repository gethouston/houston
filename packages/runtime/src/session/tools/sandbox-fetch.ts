/** Turn-local transport used by tools that call `/sandbox/*` routes. */
export type SandboxFetch = (
  path: string,
  init?: RequestInit,
) => Promise<Response>;

/** Server-mode adapter over the host's HTTP sandbox routes. */
export function httpSandboxFetch(
  baseUrl: string,
  sandboxToken: string,
): SandboxFetch {
  const base = baseUrl.replace(/\/+$/, "");
  return (path, init) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        authorization: `Bearer ${sandboxToken}`,
      },
    });
}
