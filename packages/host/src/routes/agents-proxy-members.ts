import type { HttpMethod } from "./registry";

export type ProxyEngine = "standing" | "cloudrun";

export interface ProxyMember {
  method: HttpMethod;
  rest: string;
  engines: ProxyEngine[];
}

const STANDING: ProxyEngine[] = ["standing"];
const BOTH: ProxyEngine[] = ["standing", "cloudrun"];

export const PROXY_MEMBERS: ProxyMember[] = [
  { method: "GET", rest: "health", engines: STANDING },
  { method: "GET", rest: "busy", engines: STANDING },
  { method: "GET", rest: "version", engines: STANDING },
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
    rest: "conversations/:conversationId/import",
    engines: STANDING,
  },
  {
    method: "POST",
    rest: "conversations/:conversationId/messages",
    engines: BOTH,
  },
  {
    method: "GET",
    rest: "conversations/:conversationId/browser/live",
    engines: STANDING,
  },
  {
    method: "POST",
    rest: "conversations/:conversationId/browser/input",
    engines: STANDING,
  },
];

export const HOST_SERVED_RESTS: string[] = [];
