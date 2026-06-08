import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config";

/**
 * CORS for the webapp (a different origin). Auth is a bearer token, not a
 * cookie, so a wildcard origin is safe. Set HOUSTON_CORS_ORIGIN to lock it down.
 */
export function applyCors(req: IncomingMessage, res: ServerResponse) {
  const allow =
    config.corsOrigin === "*" ? (req.headers.origin ?? "*") : config.corsOrigin;
  res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}
