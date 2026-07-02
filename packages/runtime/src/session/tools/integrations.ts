import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { currentActingContext } from "../acting-context";

/**
 * The agent's window into the user's connected third-party apps (Gmail, Google
 * Calendar, Slack, Notion, …) via the Composio platform integration.
 *
 * Two GENERIC tools — search (discover an action) then execute (run it) — kept
 * deliberately thin: they hold NO credential and talk ONLY to the host's
 * `/sandbox/integrations/*` proxy under the per-sandbox HMAC token. The host
 * (or its cloud gateway, which owns the platform key) acts as the user and
 * makes the real provider call, so a prompt-injected agent here can never read
 * any integration secret — there is none on this machine at all.
 */

const SearchParams = Type.Object({
  query: Type.String({
    description:
      "Plain-language description of what you want to do. Include the app name when you know it — 'gmail send email' finds better matches than 'send an email'. Returns matching action slugs + their input parameters.",
  }),
});
type SearchParams = Static<typeof SearchParams>;

const ExecuteParams = Type.Object({
  action: Type.String({
    description:
      "The action slug to run, taken from integration_search (e.g. 'GMAIL_SEND_EMAIL').",
  }),
  params: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description:
        "Arguments for the action, matching its input parameters from integration_search.",
    }),
  ),
});
type ExecuteParams = Static<typeof ExecuteParams>;

export interface IntegrationToolOptions {
  /** The host control-plane base URL (HOUSTON_CONTROL_PLANE_URL). */
  baseUrl: string;
  /** The per-sandbox HMAC token (HOUSTON_SANDBOX_TOKEN). */
  sandboxToken: string;
}

interface ToolMatch {
  action: string;
  toolkit: string;
  description: string;
  inputParams?: unknown;
}
interface ActionResult {
  successful: boolean;
  data?: unknown;
  error?: string;
}

/** Both integration tools, or `[]` when the host can't be reached (no creds). */
export function makeIntegrationTools(opts: IntegrationToolOptions) {
  const base = opts.baseUrl.replace(/\/$/, "");

  async function post<T>(
    path: "search" | "execute",
    body: unknown,
    signal: AbortSignal | undefined,
  ): Promise<T> {
    // WHO this turn acts as (C2): attach the header the host reads to authenticate
    // the upstream provider call as that user. Turn-scoped via AsyncLocalStorage
    // (chat.ts wraps the turn), so it's present only when this turn received one —
    // absent otherwise, preserving the act-as-owner behavior.
    const acting = currentActingContext();
    const res = await fetch(`${base}/sandbox/integrations/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.sandboxToken}`,
        ...(acting?.actingAs ? { "x-houston-acting-as": acting.actingAs } : {}),
        ...(acting?.actingUser
          ? { "x-houston-acting-user": acting.actingUser }
          : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // 409 = integrations can't act for this user yet (on desktop: they're
      // signed out of Houston, so the gateway has no session to forward) — a
      // normal, actionable state the agent should relay, not a crash.
      if (res.status === 409) {
        throw new Error(
          "Connected apps aren't available yet: the user needs to sign in to Houston (Settings), then connect their apps in Integrations. Ask them to do that, then try again.",
        );
      }
      throw new Error(
        `integrations ${path} failed (${res.status}): ${detail.slice(0, 300)}`,
      );
    }
    return (await res.json()) as T;
  }

  const search = defineTool({
    name: "integration_search",
    label: "Find an app action",
    description:
      "Search the user's connected apps (Gmail, Google Calendar, Slack, Notion, and many more) for an action you can run. Returns action slugs with their input parameters. Call this first to discover what's possible, then run one with integration_execute.",
    promptSnippet: "Search the user's connected apps for an action to run",
    parameters: SearchParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: SearchParams,
      signal: AbortSignal | undefined,
    ) {
      const { items } = await post<{ items: ToolMatch[] }>(
        "search",
        { query: params.query },
        signal,
      );
      if (items.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No actions found for "${params.query}".`,
            },
          ],
          details: { matches: 0, actions: [] as string[] },
        };
      }
      const text = items
        .map((m) => {
          const schema = m.inputParams
            ? `\n  params: ${JSON.stringify(m.inputParams)}`
            : "";
          return `- ${m.action} (${m.toolkit}): ${m.description}${schema}`;
        })
        .join("\n");
      return {
        content: [{ type: "text" as const, text }],
        details: { matches: items.length, actions: items.map((m) => m.action) },
      };
    },
  });

  const execute = defineTool({
    name: "integration_execute",
    label: "Run an app action",
    description:
      "Run an action on one of the user's connected apps — e.g. send an email, create a calendar event, add a task. Pass the action slug from integration_search and its parameters. The user's own account is used automatically; you never handle credentials.",
    promptSnippet: "Run an action on one of the user's connected apps",
    parameters: ExecuteParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: ExecuteParams,
      signal: AbortSignal | undefined,
    ) {
      const result = await post<ActionResult>(
        "execute",
        { action: params.action, params: params.params ?? {} },
        signal,
      );
      // The action ran but the app rejected it → surface, don't pretend success.
      if (!result.successful) {
        throw new Error(
          `"${params.action}" did not succeed: ${result.error ?? "unknown error"}`,
        );
      }
      const text = result.data ? JSON.stringify(result.data, null, 2) : "Done.";
      return {
        content: [{ type: "text" as const, text }],
        details: { action: params.action },
      };
    },
  });

  return [search, execute];
}

/** The tool names — pi's allowlist needs the names alongside the objects. */
export const INTEGRATION_TOOL_NAMES = [
  "integration_search",
  "integration_execute",
];
