import { createServer, type Server } from "node:http";
import { Readable } from "node:stream";

/**
 * De-risk spike for the cloud "keyless proxy" (Cloud Plan §5).
 *
 * In cloud, an agent's sandbox must NOT hold a real provider API key — its bash
 * could `env | grep -i key` and exfiltrate it. Instead pi runs keyless: the
 * sandbox points pi-ai's `model.baseUrl` at this proxy and carries only a
 * control plane-issued, non-secret sandbox token. The proxy validates that token, swaps
 * in the REAL provider key (held only here / in Secret Manager), and forwards
 * upstream. The real key never enters the sandbox.
 *
 * This is a standalone, dependency-free Node server so it can graduate straight
 * into the control plane. Streaming is passed through (no buffering) so SSE token streams
 * are not broken. Errors are surfaced, never swallowed.
 */
export type KeylessProxyConfig = {
  /** Real upstream base, e.g. "https://api.anthropic.com". */
  upstream: string;
  /** The real provider key. Injected here; never sent to the sandbox. */
  realKey: string;
  /** Validate the control plane-issued sandbox token the request carried. */
  validateSandboxToken: (token: string | undefined) => boolean;
  /** Header carrying the credential. Default "x-api-key" (Anthropic style). */
  credentialHeader?: string;
};

export function createKeylessProxy(cfg: KeylessProxyConfig): Server {
  const credHeader = (cfg.credentialHeader ?? "x-api-key").toLowerCase();

  return createServer(async (req, res) => {
    try {
      // 1. Authenticate the sandbox by its control plane-issued token (never a real key).
      const token = req.headers[credHeader];
      if (!cfg.validateSandboxToken(typeof token === "string" ? token : undefined)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized sandbox token" }));
        return;
      }

      // 2. Buffer the request body (the LLM call payload).
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = Buffer.concat(chunks);

      // 3. Forward upstream with the REAL key swapped in for the sandbox token.
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") headers[k] = v;
      }
      delete headers.host;
      delete headers["content-length"];
      headers[credHeader] = cfg.realKey; // the injection — sandbox token is overwritten

      const upstream = await fetch(`${cfg.upstream}${req.url ?? ""}`, {
        method: req.method,
        headers,
        body: body.length ? body : undefined,
      });

      // 4. Stream the response straight back (do not buffer — preserves SSE).
      const outHeaders: Record<string, string> = {};
      upstream.headers.forEach((v, k) => {
        if (k !== "content-encoding" && k !== "content-length") outHeaders[k] = v;
      });
      res.writeHead(upstream.status, outHeaders);
      if (upstream.body) Readable.fromWeb(upstream.body as any).pipe(res);
      else res.end();
    } catch (err) {
      // Beta-stage policy: surface, never swallow.
      if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "proxy upstream failed", detail: String(err) }));
    }
  });
}
