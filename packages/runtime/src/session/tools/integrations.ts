import {
  defineTool,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { currentActingContext } from "../acting-context";
import {
  reconnectQueued,
  recordConnection,
  recordSignin,
} from "../interaction";
import { assertNotPlanMode } from "../live-mode-gate";
import {
  classifyIntegrationFailure,
  failureClassGuidance,
  type IntegrationFailureClass,
  type ReconnectRoute,
  toolkitForAction,
} from "./integrations-failure-class";
import { layoutJson } from "./integrations-json";
import {
  missingPermissionHint,
  offerScopeReconnect,
} from "./integrations-missing-permission";
import {
  reconnectOfferedBefore,
  rememberReconnectOffered,
} from "./integrations-reconnect-once";
import type { ToolMatch } from "./integrations-render";
import {
  parameterFailureError,
  parameterFailureHint,
  searchEmptyText,
  searchLeadNote,
} from "./integrations-search-notes";
import {
  REQUEST_CONNECTION_GUIDANCE,
  searchResultText,
} from "./integrations-search-result";
import type { SandboxFetch } from "./sandbox-fetch";

const SearchParams = Type.Object({
  query: Type.String({
    description:
      "Plain-language description of ONE specific thing you want to do (e.g. 'send an email', 'query analytics for the most active users'). A task with several independent steps gets one search per step - do not lump them into one loose query. Include the app name when you know it. Returns matching action slugs + their input parameters.",
  }),
  app: Type.Optional(
    Type.String({
      description:
        "The app the task names ('posthog', 'gmail', 'google sheets'). When set, results are scoped to ONLY that app's actions - ALWAYS set it when the user names the app. Omit it only when no app was named and you are discovering which app could do the task.",
    }),
  ),
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
  account: Type.Optional(
    Type.String({
      description:
        "Which connected account to act on, when the app has MORE than one (the account id from integration_search results, e.g. 'ca_…'). Omit when the app has a single account.",
    }),
  ),
});
type ExecuteParams = Static<typeof ExecuteParams>;

const ConnectParams = Type.Object({
  toolkit: Type.String({
    description:
      "The app's toolkit slug - the identifier from integration_search results (e.g. 'gmail', 'slack', 'notion').",
  }),
  reason: Type.Optional(
    Type.String({
      description:
        "A short user-facing reason shown verbatim to a non-technical user under the title 'Connect <App>'. Write it as a 'To ...' phrase, for example: 'To read your invoices and draft replies.'",
    }),
  ),
});
type ConnectParams = Static<typeof ConnectParams>;

function normalizeToolkitSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function signalCode(detail: string): string | undefined {
  try {
    const body: unknown = JSON.parse(detail);
    if (body && typeof body === "object") {
      const { code } = body as { code?: unknown };
      if (typeof code === "string") return code;
    }
  } catch {}
  return undefined;
}

class ToolkitNotAllowedError extends Error {
  constructor() {
    super("toolkit not allowed");
    this.name = "ToolkitNotAllowedError";
  }
}

class NoAgentAccessError extends Error {
  constructor() {
    super("no agent access");
    this.name = "NoAgentAccessError";
  }
}

class ActionNotFoundError extends Error {
  constructor() {
    super("action not found");
    this.name = "ActionNotFoundError";
  }
}

const NO_AGENT_ACCESS_GUIDANCE =
  "The user does not have access to this agent, so its connected apps cannot be used for them. Tell the user plainly that someone who manages this agent needs to give them access to it in this agent's Settings, under People. Do not retry until they confirm they have access, do not call request_connection, and never imply the app they asked for is unsupported or that something is broken.";

export interface IntegrationToolOptions {
  call: SandboxFetch;
}

const MAX_RESULT_CHARS = 512 * 1024;

function boundResultText(text: string, guidance: string): string {
  if (text.length <= MAX_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_RESULT_CHARS)}\n[result truncated: it exceeded the ${MAX_RESULT_CHARS / 1024} KB tool-result limit and is cut off mid-document. ${guidance}]`;
}
interface ActionResult {
  successful: boolean;
  data?: unknown;
  error?: string;
}

export function makeIntegrationTools(opts: IntegrationToolOptions) {
  const toolkitByAction = new Map<string, string>();
  async function post<T>(
    path: "search" | "execute",
    body: unknown,
    signal: AbortSignal | undefined,
  ): Promise<T> {
    const acting = currentActingContext();
    const res = await opts.call(`/sandbox/integrations/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
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
      const code = signalCode(detail);
      if (code === "toolkit_not_allowed") {
        throw new ToolkitNotAllowedError();
      }
      if (code === "not_assigned") {
        throw new NoAgentAccessError();
      }
      if (code === "signin_required") {
        recordSignin({
          reason: "Sign in to Houston to use your connected apps.",
        });
        throw new Error(
          "The user is signed out of Houston, so connected apps can't act for them yet. A sign-in card has been queued in the interaction flow. Queue any request_connection you still need (it will follow the sign-in step), then end your turn. Do NOT tell the user to open Settings - you get a message automatically once they're signed in.",
        );
      }
      if (code === "grant_expired") {
        throw new Error(
          "This turn's connected-app access expired before the action could run. Do not retry it in this turn, especially if it may have changed external data. Tell the user plainly that connected apps are temporarily unavailable and ask them to send a new message to continue.",
        );
      }
      if (code === "integrations_not_configured") {
        throw new Error(
          "Connected apps are not set up in this Houston install. Tell the user plainly that connected apps aren't available here (a self-hoster enables them by setting COMPOSIO_API_KEY), and do not offer to connect any apps.",
        );
      }
      if (path === "execute" && detail.includes("Tool_ToolNotFound")) {
        throw new ActionNotFoundError();
      }
      if (res.status >= 400 && res.status < 500) {
        throw new Error(
          `integrations ${path} failed (${res.status}${code ? `, code ${code}` : ""}). The request was refused. Tell the user plainly that this could not be done right now, and never quote this message, any code, or any other technical detail to them.`,
        );
      }
      throw new Error(
        `integrations ${path} failed (${res.status}): ${detail.slice(0, 300)}`,
      );
    }
    return (await res.json()) as T;
  }

  const search = defineTool<
    typeof SearchParams,
    { matches: number; actions: string[]; noAgentAccess?: boolean }
  >({
    name: "integration_search",
    label: "Find an app action",
    description:
      "Search the user's apps (Gmail, Google Calendar, Slack, Notion, and many more) for an action you can run. Returns action slugs with their input parameters; actions marked NOT CONNECTED need the user to connect the app first (the result explains how to offer that). Call this first to discover what's possible, then run one with integration_execute. When the user names an app, pass it as `app` to scope results to it - the result says so with a leading NOTE when this deployment could not apply the scope, and then the matches may belong to other apps. Never conclude an app has no actions from a result where other apps dominate: if the app appears only as an app row (no actions), search again with `app` set to it before reporting any capability gap.",
    promptSnippet: "Search the user's connected apps for an action to run",
    parameters: SearchParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: SearchParams,
      signal: AbortSignal | undefined,
    ) {
      let items: ToolMatch[];
      let unscopedFallback: boolean | undefined;
      let scopeIgnored: boolean | undefined;
      try {
        ({ items, unscopedFallback, scopeIgnored } = await post<{
          items: ToolMatch[];
          unscopedFallback?: boolean;
          scopeIgnored?: boolean;
        }>(
          "search",
          { query: params.query, ...(params.app ? { app: params.app } : {}) },
          signal,
        ));
      } catch (err) {
        if (err instanceof NoAgentAccessError) {
          return {
            content: [
              { type: "text" as const, text: NO_AGENT_ACCESS_GUIDANCE },
            ],
            details: { matches: 0, actions: [], noAgentAccess: true },
          };
        }
        throw err;
      }
      for (const m of items)
        if (m.action && m.toolkit) toolkitByAction.set(m.action, m.toolkit);
      if (items.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: searchEmptyText(
                params.query,
                params.app,
                scopeIgnored === true,
              ),
            },
          ],
          details: { matches: 0, actions: [] as string[] },
        };
      }
      const leadNote = searchLeadNote(
        params.app,
        unscopedFallback,
        scopeIgnored,
      );
      return {
        content: [
          { type: "text" as const, text: searchResultText(items, leadNote) },
        ],
        details: {
          matches: items.length,
          actions: items.filter((m) => m.action).map((m) => m.action),
        },
      };
    },
  });

  const execute = defineTool<
    typeof ExecuteParams,
    {
      action: string;
      appTurnedOff?: boolean;
      noAgentAccess?: boolean;
      actionNotFound?: boolean;
    }
  >({
    name: "integration_execute",
    label: "Run an app action",
    description:
      "Run an action on one of the user's connected apps - e.g. send an email, create a calendar event, add a task. Pass the action slug from integration_search and its parameters. The user's own account is used automatically; you never handle credentials. When the app has several connected accounts, always pass `account`; when the right one is unclear, ask the user before acting, and never guess.",
    promptSnippet: "Run an action on one of the user's connected apps",
    parameters: ExecuteParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: ExecuteParams,
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext | undefined,
    ) {
      assertNotPlanMode("take real-world actions on the user's connected apps");
      let result: ActionResult;
      try {
        result = await post<ActionResult>(
          "execute",
          {
            action: params.action,
            params: params.params ?? {},
            ...(params.account ? { account: params.account } : {}),
          },
          signal,
        );
      } catch (err) {
        if (err instanceof ToolkitNotAllowedError) {
          const action = params.action;
          return {
            content: [
              {
                type: "text" as const,
                text: `This action's app is turned off for this agent, so it can't run. Tell the user it can be switched on in this agent's Settings, under Apps (someone who manages the agent can do it; otherwise they should ask whoever does). Do not retry this action until the user confirms it's enabled, and never imply the app is unsupported.`,
              },
            ],
            details: { action, appTurnedOff: true },
          };
        }
        if (err instanceof NoAgentAccessError) {
          return {
            content: [
              { type: "text" as const, text: NO_AGENT_ACCESS_GUIDANCE },
            ],
            details: { action: params.action, noAgentAccess: true },
          };
        }
        if (err instanceof ActionNotFoundError) {
          return {
            content: [
              {
                type: "text" as const,
                text: `The action slug "${params.action}" does not exist in the app catalog. App actions are renamed and removed over time, so a slug remembered from earlier in this conversation (or guessed) may not be real any more. Call integration_search now to find the current action for what you are doing, then run integration_execute with a slug taken from those fresh results. Do not retry this slug, do not invent slugs, and never mention slugs or any other technical detail to the user.`,
              },
            ],
            details: { action: params.action, actionNotFound: true },
          };
        }
        throw parameterFailureError(err, params.action);
      }
      if (!result.successful) {
        const reason = result.error ?? "unknown error";
        const { toolkit, known } = toolkitForAction(
          params.action,
          toolkitByAction,
        );
        const failure = classifyIntegrationFailure(reason, toolkit);
        const hint = failure
          ? failureClassGuidance(
              failure,
              params.action,
              reconnectRoute(failure, known, ctx),
            )
          : /connected account|not connected/i.test(reason)
            ? ` The user has not connected this app. ${REQUEST_CONNECTION_GUIDANCE}`
            : missingPermissionHint(reason, params.action, toolkit, () =>
                offerScopeReconnect(toolkit, known, ctx),
              ) || parameterFailureHint(reason, params.action);
        throw new Error(`"${params.action}" did not succeed: ${reason}${hint}`);
      }
      const text = boundResultText(
        result.data ? layoutJson(result.data) : "Done.",
        "Do not rely on the cut-off tail. Re-run the action with tighter parameters - fewer results, specific ids or fields, and without full payloads/bodies - to get what you need within the limit.",
      );
      return {
        content: [{ type: "text" as const, text }],
        details: { action: params.action },
      };
    },
  });

  return [search, execute, makeRequestConnectionTool()];
}

function reconnectRoute(
  failure: IntegrationFailureClass,
  known: boolean,
  ctx: ExtensionContext | undefined,
): ReconnectRoute {
  if (failure.kind !== "needs_reconnect") return "card";
  if (reconnectQueued(failure.toolkit)) return "card";
  if (!known || reconnectOfferedBefore(failure.toolkit, ctx))
    return "integrations_page";
  recordConnection({
    toolkit: failure.toolkit,
    refusedAt: new Date().toISOString(),
  });
  rememberReconnectOffered(failure.toolkit);
  return "card";
}

export function makeRequestConnectionTool() {
  return defineTool({
    name: REQUEST_CONNECTION_TOOL_NAME,
    label: "Ask the user to connect an app",
    description:
      "Ask the user to connect one of their apps (Gmail, Slack, Notion, and many more) when an action needs it. This adds a connect step to the one interaction card the user sees in place of the chat input; queue any questions you also need (via ask_user) in the SAME turn, then end your turn. Never spell out the app's slug or a link in your reply - you get a message automatically once the connection is live.",
    promptSnippet: "Ask the user to connect an app so an action can run",
    parameters: ConnectParams,
    executionMode: "sequential",
    async execute(_id: string, params: ConnectParams) {
      assertNotPlanMode("ask the user to connect an app");
      const toolkit = normalizeToolkitSlug(params.toolkit);
      if (!toolkit)
        throw new Error("request_connection needs a non-empty toolkit slug.");
      const reason = params.reason?.trim();
      recordConnection({ toolkit, ...(reason ? { reason } : {}) });
      return {
        content: [
          {
            type: "text" as const,
            text: "This app was added as a connect step to the one interaction card the user sees in place of the chat input. Queue everything else this task needs now (call ask_user for any questions in this same turn), then end your turn. Do not spell out the app's slug or any link in your reply, and do not ask the user to confirm - you get a message automatically once the connection is live.",
          },
        ],
        details: { toolkit },
      };
    },
  });
}

export const REQUEST_CONNECTION_TOOL_NAME = "request_connection";

export const INTEGRATION_TOOL_NAMES = [
  "integration_search",
  "integration_execute",
  REQUEST_CONNECTION_TOOL_NAME,
];
