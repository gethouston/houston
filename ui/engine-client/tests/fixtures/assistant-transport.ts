/**
 * Fixture twin of `packages/web/src/engine-adapter/cp/fetch.ts`: the one
 * function that reaches the wire, plus the module-scope path helper the
 * operation sources build their templates from. The extractor reads this file
 * only for those shared helpers — nothing here becomes an operation.
 */
export interface ControlPlaneConfig {
  baseUrl: string;
  token: string;
}

export const agentPath = (id: string) => `/agents/${encodeURIComponent(id)}`;

export function cpFetch(
  cfg: ControlPlaneConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${cfg.baseUrl}${path}`, init);
}
