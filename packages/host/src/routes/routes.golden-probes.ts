/**
 * The host's enumerable `METHOD path` surface, as it stood when the route
 * registry was built — the probe set routes-golden.test.ts replays.
 *
 * Grouped by the pipeline phase each pair is answered in, because the phase is
 * what decides which derived probes it gets: only a user- or agent-phase path
 * has an unauthenticated and a wrong-user answer worth pinning. Every entry is
 * a PATTERN; testing/route-replay.ts substitutes real ids for the `:name`
 * segments and keys the recording by the pattern, so the baseline survives a
 * store that mints different ids on every run.
 */
import { AGENT_PROBES } from "./routes.golden-probes-agent";

export const PUBLIC_PROBES: string[] = [
  "GET /health",
  "GET /v1/version",
  "GET /v1/capabilities",
  "GET /v1/catalog",
  "GET /v1/integrations/custom/oauth/callback",
];

export const SANDBOX_PROBES: string[] = [
  "GET /sandbox/credential",
  "POST /sandbox/credential/revoked",
  "GET /sandbox/provider-usage",
  "POST /sandbox/integrations/search",
  "POST /sandbox/integrations/execute",
  "POST /sandbox/integrations/custom/detect",
  "POST /sandbox/integrations/custom/add",
  "POST /sandbox/integrations/custom/remove",
  "POST /sandbox/integrations/custom/status",
  "POST /sandbox/routines/save",
  "POST /sandbox/learnings/save",
  "GET /sandbox/missions",
  "GET /sandbox/missions/read",
  "POST /sandbox/missions/start",
  "POST /sandbox/missions/status",
  "POST /sandbox/missions/settle",
  "POST /sandbox/assistant/call",
  "POST /sandbox/assistant/pending",
  "PUT /sandbox/transcripts/conversations/:conversationId",
  "DELETE /sandbox/transcripts/conversations/:conversationId",
  "PUT /sandbox/transcripts/conversations/:conversationId/turns/:turnId/user",
  "PUT /sandbox/transcripts/conversations/:conversationId/turns/:turnId/assistant",
  "POST /sandbox/transcripts/conversations/:conversationId/truncate",
  "POST /sandbox/transcripts/conversations/:conversationId/repair",
];

export const USER_PROBES: string[] = [
  "GET /v1/events",
  "GET /activity",
  "GET /metrics",
  "POST /feedback",
  "POST /v1/skills/repo/list",
  "GET /v1/workspaces/:workspaceId/shared-skills",
  "GET /v1/workspaces/:workspaceId/shared-skills/:slug",
  "POST /v1/workspaces/:workspaceId/shared-skills",
  "POST /v1/workspaces/:workspaceId/shared-skills/:slug",
  "PUT /v1/workspaces/:workspaceId/shared-skills/:slug",
  "DELETE /v1/workspaces/:workspaceId/shared-skills/:slug",
  "GET /v1/workspaces",
  "PATCH /v1/workspaces/:workspaceId",
  "GET /v1/workspaces/:workspaceId/sidebar-layout",
  "PUT /v1/workspaces/:workspaceId/sidebar-layout",
  "GET /v1/preferences/:key",
  "PUT /v1/preferences/:key",
  "POST /v1/portable/preview",
  "POST /v1/portable/install",
  "POST /v1/portable/fetch-from-store",
  "GET /v1/migration/source",
  "GET /v1/agent-configs",
  "POST /v1/agents/install-from-github",
  "GET /v1/integrations/custom/definitions",
  "POST /v1/integrations/custom/definitions",
  "POST /v1/integrations/custom/detect",
  "PATCH /v1/integrations/custom/definitions/:slug",
  "DELETE /v1/integrations/custom/definitions/:slug",
  "GET /v1/integrations/custom/definitions/:slug/tools",
  "POST /v1/integrations/custom/definitions/:slug/oauth/start",
  "POST /v1/integrations/custom/definitions/:slug/credential",
  "PUT /v1/integrations/session",
  "POST /v1/integrations/reconnect-notice/dismiss",
  "GET /v1/integrations",
  "GET /v1/integrations/:provider/toolkits",
  "GET /v1/integrations/:provider/connections",
  "GET /v1/integrations/:provider/connections/:connectionId",
  "POST /v1/integrations/:provider/connect",
  "POST /v1/integrations/:provider/disconnect",
  "POST /v1/integrations/:provider/search",
  "POST /v1/integrations/:provider/execute",
  "POST /setup-runtime/credential/capture",
  "POST /setup-runtime/credential/forget",
  "POST /setup-runtime/credential/api-key",
  "POST /setup-runtime/credential/claude-oauth",
  "GET /setup-runtime/providers",
  "GET /setup-runtime/auth/status",
  "POST /setup-runtime/auth/:provider/login",
  "POST /setup-runtime/auth/:provider/login/complete",
  "POST /setup-runtime/auth/:provider/login/cancel",
  "POST /setup-runtime/auth/:provider/logout",
  "GET /v1/assistant",
  "GET /agents",
  "POST /agents",
];

export { AGENT_PROBES };

/** Every probe with the phase it is answered in, grouped by phase. */
export const GOLDEN_PROBES: { probe: string; phase: string }[] = [
  ...PUBLIC_PROBES.map((probe) => ({ probe, phase: "public" })),
  ...SANDBOX_PROBES.map((probe) => ({ probe, phase: "sandbox" })),
  ...USER_PROBES.map((probe) => ({ probe, phase: "user" })),
  ...AGENT_PROBES.map((probe) => ({ probe, phase: "agent" })),
];
