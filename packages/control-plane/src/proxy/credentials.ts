import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { CredentialVault } from "../ports";

/**
 * Keyless credential proxy (Cloud Plan §5), graduated from
 * packages/runtime/spike/keyless-proxy.ts and made multi-tenant.
 *
 * A sandbox must NEVER hold a real provider key — its bash could `env | grep key`
 * and exfiltrate it. Instead pi points its `model.baseUrl` at this proxy and
 * carries only a non-secret, control plane-issued sandbox token in the credential header.
 * Per request the proxy:
 *
 *   1. reads the sandbox token from the credential header (default x-api-key),
 *   2. validates + decodes it via the CredentialVault → { workspaceId, agentId },
 *   3. looks up that workspace's REAL provider key (held only in the control plane),
 *   4. swaps the real key in for the sandbox token and forwards upstream,
 *   5. streams the upstream response straight back (no buffering → SSE intact).
 *
 * Failures surface as HTTP errors (401 bad/forbidden token, 502 upstream fail);
 * nothing is swallowed. The real key never appears in any response to the sandbox.
 */
export interface KeylessProxyConfig {
  /** Real upstream base for the provider, e.g. "https://api.anthropic.com". */
  upstream: string;
  /** Provider name used to resolve the workspace's real key, e.g. "anthropic". */
  provider: string;
  /** Holds + resolves real keys and validates sandbox tokens. */
  vault: CredentialVault;
  /** Header carrying the credential. Default "x-api-key" (Anthropic style). */
  credentialHeader?: string;
}

function sendError(res: ServerResponse, status: number, error: string, detail?: string): void {
  const body = detail ? { error, detail } : { error };
  if (!res.headersSent) res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function handleProxyRequest(
  cfg: KeylessProxyConfig,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const credHeader = (cfg.credentialHeader ?? "x-api-key").toLowerCase();

  // 1. Authenticate the sandbox by its control plane-issued token (never a real key).
  const presented = req.headers[credHeader];
  const token = typeof presented === "string" ? presented : undefined;
  const claim = token ? cfg.vault.validateSandboxToken(token) : null;
  if (!claim) {
    return sendError(res, 401, "unauthorized sandbox token");
  }

  // 2. Resolve the workspace's REAL provider key. Absence is a config error, not a leak.
  const realKey = await cfg.vault.realKeyFor(claim.workspaceId, cfg.provider);
  if (realKey === null) {
    return sendError(
      res,
      502,
      "no provider key for workspace",
      `${claim.workspaceId}/${cfg.provider}`,
    );
  }

  // 3. Buffer the request body (the LLM call payload).
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = Buffer.concat(chunks);

  // 4. Forward upstream with the real key swapped in for the sandbox token.
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers[k] = v;
  }
  delete headers.host;
  delete headers["content-length"];
  headers[credHeader] = realKey; // the injection — sandbox token is overwritten

  let upstream: Response;
  try {
    upstream = await fetch(`${cfg.upstream}${req.url ?? ""}`, {
      method: req.method,
      headers,
      body: body.length ? body : undefined,
    });
  } catch (err) {
    return sendError(res, 502, "proxy upstream failed", String(err));
  }

  // 5. Stream the response straight back (do not buffer — preserves SSE).
  const outHeaders: Record<string, string> = {};
  upstream.headers.forEach((v, k) => {
    if (k !== "content-encoding" && k !== "content-length") outHeaders[k] = v;
  });
  res.writeHead(upstream.status, outHeaders);
  if (!upstream.body) {
    res.end();
    return;
  }
  Readable.fromWeb(upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
}

/** Build a standalone keyless-proxy server. Used in cloud; trivially testable. */
export function createKeylessProxy(cfg: KeylessProxyConfig): Server {
  return createServer((req, res) => {
    handleProxyRequest(cfg, req, res).catch((err) => {
      sendError(res, 502, "proxy upstream failed", String(err));
    });
  });
}
