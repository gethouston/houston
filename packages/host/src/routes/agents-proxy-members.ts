import type { HttpMethod } from "./registry";

/**
 * WHAT THE AGENT'S ENGINE SERVES, enumerated rather than waved at.
 *
 * The per-agent catch-all (routes/agents.ts) matches `*rest` and forwards
 * whatever it is handed, so this list never decides a match. It is the
 * published surface: the SDK parity gate reads it, and routes-proxy-drift.test
 * proves it against packages/runtime's own transport tables, which are the only
 * place these pairs are implemented.
 *
 * Two engines answer them. The STANDING runtime (channel/proxy.ts → the pi
 * runtime's transport server) serves all of them; the CLOUDRUN dispatch
 * (turn/dispatch.ts + turn/dispatch-providers.ts), which reconstructs the same
 * wire surface from object storage and per-turn Cloud Run, serves the subset a
 * web client needs. Annotating each pair is what makes "the web client asked
 * for X and a cloudrun agent 404ed" a readable fact rather than a bug report.
 */
export type ProxyEngine = "standing" | "cloudrun";

export interface ProxyMember {
  method: HttpMethod;
  /** The path after `/agents/:agentId/`, forwarded to the engine verbatim. */
  rest: string;
  engines: ProxyEngine[];
}

const STANDING: ProxyEngine[] = ["standing"];
const BOTH: ProxyEngine[] = ["standing", "cloudrun"];

export const PROXY_MEMBERS: ProxyMember[] = [
  // Liveness, served ahead of the runtime's own bearer wall.
  { method: "GET", rest: "health", engines: STANDING },
  { method: "GET", rest: "busy", engines: STANDING },
  { method: "GET", rest: "version", engines: STANDING },
  // Providers, settings and the auth surface (provider-routes.ts).
  { method: "GET", rest: "providers", engines: BOTH },
  { method: "GET", rest: "providers/usage", engines: STANDING },
  { method: "PUT", rest: "settings", engines: BOTH },
  { method: "POST", rest: "settings/claim", engines: STANDING },
  { method: "GET", rest: "auth/status", engines: BOTH },
  { method: "GET", rest: "auth/export", engines: STANDING },
  { method: "POST", rest: "auth/scrub-refresh", engines: STANDING },
  { method: "POST", rest: "providers/openai-compatible", engines: STANDING },
  { method: "GET", rest: "providers/openai-compatible", engines: STANDING },
  {
    method: "POST",
    rest: "auth/anthropic/oauth-credential",
    engines: STANDING,
  },
  { method: "POST", rest: "auth/:provider/api-key", engines: STANDING },
  { method: "DELETE", rest: "auth/:provider/api-key", engines: STANDING },
  { method: "POST", rest: "auth/:provider/login", engines: BOTH },
  { method: "POST", rest: "auth/:provider/login/complete", engines: STANDING },
  { method: "POST", rest: "auth/:provider/login/cancel", engines: STANDING },
  { method: "POST", rest: "auth/:provider/logout", engines: BOTH },
  // Conversations: the transcript, the live stream and the turn (conversation-routes.ts).
  { method: "GET", rest: "conversations", engines: BOTH },
  { method: "POST", rest: "title", engines: STANDING },
  { method: "PATCH", rest: "conversations/:conversationId", engines: STANDING },
  {
    method: "DELETE",
    rest: "conversations/:conversationId",
    engines: STANDING,
  },
  {
    method: "GET",
    rest: "conversations/:conversationId/messages",
    engines: BOTH,
  },
  {
    method: "GET",
    rest: "conversations/:conversationId/events",
    engines: BOTH,
  },
  {
    method: "POST",
    rest: "conversations/:conversationId/cancel",
    engines: BOTH,
  },
  {
    method: "POST",
    rest: "conversations/:conversationId/dismiss-interaction",
    engines: STANDING,
  },
  {
    method: "POST",
    rest: "conversations/:conversationId/mode",
    engines: STANDING,
  },
  {
    method: "POST",
    rest: "conversations/:conversationId/title",
    engines: STANDING,
  },
  {
    method: "POST",
    rest: "conversations/:conversationId/truncate",
    engines: STANDING,
  },
  {
    method: "POST",
    rest: "conversations/:conversationId/messages",
    engines: BOTH,
  },
  // Create-with-AI's one-shot (generate-route.ts).
  { method: "POST", rest: "generate-agent", engines: STANDING },
];

/**
 * The one pair the standing engine implements that never reaches it: the host
 * answers `POST portable/anonymize` itself (routes/portable-anonymize.ts), from
 * a slot ahead of this family, because the export wizard runs on the host's
 * gathered selection. Declared so the drift test can still assert that this
 * list and the engine's transport tables are the same set.
 */
export const HOST_SERVED_RESTS: string[] = ["POST portable/anonymize"];
