import { defineTool } from "@earendil-works/pi-coding-agent";
import type { CustomIntegrationAuth } from "@houston/runtime-client";
import { type Static, Type } from "typebox";
import { currentActingContext } from "../acting-context";
import { recordPendingInteraction } from "../interaction";

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
  account: Type.Optional(
    Type.String({
      description:
        "id or label of the connected account; needed only when the user has more than one account for that app.",
    }),
  ),
});
type ExecuteParams = Static<typeof ExecuteParams>;

const ConnectParams = Type.Object({
  toolkit: Type.String({
    description:
      "The app's toolkit slug — the identifier from integration_search results (e.g. 'gmail', 'slack', 'notion').",
  }),
  reason: Type.Optional(
    Type.String({
      description:
        "A short, plain-language reason to show the user for why this app is needed.",
    }),
  ),
});
type ConnectParams = Static<typeof ConnectParams>;

const ProposeCustomParams = Type.Object({
  name: Type.String({
    description:
      "Short, human-readable name for the service (e.g. 'Acme CRM'). Shown to the user on the setup card.",
  }),
  baseUrl: Type.String({
    description:
      "The service's HTTPS API base URL, including any shared path prefix (e.g. 'https://api.acme.com/v2'). Requests are confined to this origin and prefix.",
  }),
  authType: Type.Union([Type.Literal("header"), Type.Literal("query")], {
    description:
      "How the service authenticates: 'header' sends the key in a request header, 'query' sends it as a URL query parameter.",
  }),
  authField: Type.String({
    description:
      "The name of the header (e.g. 'Authorization') or query parameter (e.g. 'api_key') that carries the key.",
  }),
  authPrefix: Type.Optional(
    Type.String({
      description:
        "Text prepended to the key inside a header, used verbatim (e.g. 'Bearer '). Header auth only; leave unset when the header value is the raw key.",
    }),
  ),
  description: Type.String({
    description:
      "One or two sentences on what the service does and what you'd use it for. Future agent turns read this to know when to reach for it.",
  }),
  reason: Type.Optional(
    Type.String({
      description:
        "A short, plain-language reason to show the user for why this service is needed.",
    }),
  ),
});
type ProposeCustomParams = Static<typeof ProposeCustomParams>;

/**
 * Canonical toolkit slug: trimmed + lowercased, matching the connection/catalog
 * lists the connect card compares against (app-side `normalizeToolkitSlug`). A
 * model-authored slug can carry stray casing or whitespace; comparing raw would
 * silently miss a real connection and leave the card stuck on "Connect".
 */
function normalizeToolkitSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

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
  /** Host-reported: does the user have this action's app connected? */
  connected?: boolean;
  /**
   * Host-reported provider that owns this match, set by the sandbox route's
   * multi-provider fan-out ("composio" | "custom" | …). The agent-facing tools
   * key on the unique action slug (custom actions are CUSTOM_<SLUG>_REQUEST), so
   * this is carried for tolerance only — not rendered into the results text.
   */
  provider?: string;
}

/** One connected account the acting agent is granted, as reported by the host. */
interface ConnectedAccountInfo {
  toolkit: string;
  connectionId: string;
  accountLabel?: string;
}

/** The host's search reply: matches plus the agent's granted accounts. */
interface SearchResult {
  items: ToolMatch[];
  accounts?: ConnectedAccountInfo[];
}

/**
 * The host asked which account to use (HTTP 400 `account_required`): the app has
 * more than one granted account and none was pinned. Not a failure to surface as
 * a crash — the model should retry with `account` — so it carries the choices.
 */
class AccountRequiredError extends Error {
  constructor(readonly accounts: ConnectedAccountInfo[]) {
    super("account_required");
    this.name = "AccountRequiredError";
  }
}

/** Parse a JSON body, tolerating a non-JSON error payload (returns undefined). */
function safeJson(
  text: string,
): { error?: string; accounts?: unknown } | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The instruction appended to search results (and connection-shaped execute
 * failures) that teaches the model the in-chat connect hand-off: call the
 * `request_connection` tool, which records the pending connection so Houston
 * renders a one-click connect card in place of the chat input.
 */
const REQUEST_CONNECTION_GUIDANCE =
  "To let the user connect an app, call the request_connection tool with that app's toolkit (the slug shown in the results). Houston shows the user a one-click connect card in place of the chat input, then automatically sends you a message once the connection is live so you can continue — do not ask the user to confirm.";

/** Render one account as `"label" (connectionId)` for a model-facing line. */
function accountEntry(a: ConnectedAccountInfo): string {
  return `"${a.accountLabel ?? "unnamed"}" (${a.connectionId})`;
}

/**
 * The trailing block appended to search results when the agent is granted more
 * than one account for an app: list each such app's accounts and one line
 * telling the model to pass `account` on execute for those apps.
 */
function formatMultiAccounts(
  accounts: ConnectedAccountInfo[] | undefined,
): string {
  if (!accounts?.length) return "";
  const byToolkit = new Map<string, ConnectedAccountInfo[]>();
  for (const a of accounts) {
    const list = byToolkit.get(a.toolkit) ?? [];
    list.push(a);
    byToolkit.set(a.toolkit, list);
  }
  const lines: string[] = [];
  for (const [toolkit, list] of byToolkit) {
    if (list.length < 2) continue;
    lines.push(`Accounts for ${toolkit}: ${list.map(accountEntry).join(", ")}`);
  }
  if (lines.length === 0) return "";
  return `\n\n${lines.join("\n")}\nWhen running an action for those apps, pass the account parameter (the id or label above) to choose which account to use.`;
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
      // The app has several granted accounts and none was pinned → the model
      // must choose one and retry. Carry the choices instead of crashing.
      if (res.status === 400) {
        const parsed = safeJson(detail);
        if (parsed?.error === "account_required") {
          throw new AccountRequiredError(
            Array.isArray(parsed.accounts)
              ? (parsed.accounts as ConnectedAccountInfo[])
              : [],
          );
        }
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
      "Search the user's apps (Gmail, Google Calendar, Slack, Notion, and many more) for an action you can run. Returns action slugs with their input parameters; actions marked NOT CONNECTED need the user to connect the app first (the result explains how to offer that). Call this first to discover what's possible, then run one with integration_execute.",
    promptSnippet: "Search the user's connected apps for an action to run",
    parameters: SearchParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: SearchParams,
      signal: AbortSignal | undefined,
    ) {
      const { items, accounts } = await post<SearchResult>(
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
      const list = items
        .map((m) => {
          const status = m.connected === false ? ", NOT CONNECTED" : "";
          const schema = m.inputParams
            ? `\n  params: ${JSON.stringify(m.inputParams)}`
            : "";
          return `- ${m.action} (${m.toolkit}${status}): ${m.description}${schema}`;
        })
        .join("\n");
      // Some matches need a connection first → teach the hand-off inline, at
      // the moment the model actually faces a not-connected app.
      const body = items.some((m) => m.connected === false)
        ? `${list}\n\nActions marked NOT CONNECTED will fail until the user connects that app. ${REQUEST_CONNECTION_GUIDANCE}`
        : list;
      // When the agent has several accounts for an app, list them so the model
      // can pass the right one on execute.
      const text = `${body}${formatMultiAccounts(accounts)}`;
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
      const requestBody: Record<string, unknown> = {
        action: params.action,
        params: params.params ?? {},
      };
      // Only pin an account when the model named one — omitting it lets the host
      // auto-pin when exactly one account is granted.
      if (params.account) requestBody.account = params.account;
      let result: ActionResult;
      try {
        result = await post<ActionResult>("execute", requestBody, signal);
      } catch (err) {
        // Not an error to crash on: the app has several accounts and none was
        // pinned. Tell the model which ones exist so it retries with `account`.
        if (err instanceof AccountRequiredError) {
          const choices = err.accounts.map(accountEntry).join(", ");
          return {
            content: [
              {
                type: "text" as const,
                text: `This app has more than one connected account. Retry integration_execute with the account parameter set to one of: ${choices}.`,
              },
            ],
            details: { action: params.action, accountRequired: true },
          };
        }
        throw err;
      }
      // The action ran but the app rejected it → surface, don't pretend success.
      if (!result.successful) {
        const reason = result.error ?? "unknown error";
        // A missing connection is an actionable state, not a dead end: hand
        // the model the connect-card instruction right in the error.
        const hint = /connected account|not connected/i.test(reason)
          ? ` The user has not connected this app. ${REQUEST_CONNECTION_GUIDANCE}`
          : "";
        throw new Error(`"${params.action}" did not succeed: ${reason}${hint}`);
      }
      const text = result.data ? JSON.stringify(result.data, null, 2) : "Done.";
      return {
        content: [{ type: "text" as const, text }],
        details: { action: params.action, accountRequired: false },
      };
    },
  });

  // The in-chat connect hand-off. Records the pending connection for this turn
  // (carried on the terminal `done` frame → a one-click connect card rendered in
  // place of the chat input). Gated with the integration tools because it only
  // makes sense where the user can actually connect apps. Holds no credential
  // and makes no network call — it just records the request.
  const requestConnection = defineTool({
    name: "request_connection",
    label: "Ask the user to connect an app",
    description:
      "Ask the user to connect one of their apps (Gmail, Slack, Notion, and many more) when an action needs it. Houston shows a one-click connect card in place of the chat input; end your turn right after calling this. Never spell out the app's slug or a link in your reply — Houston sends you a message automatically once the connection is live.",
    promptSnippet: "Ask the user to connect an app so an action can run",
    parameters: ConnectParams,
    executionMode: "sequential",
    async execute(_id: string, params: ConnectParams) {
      const toolkit = normalizeToolkitSlug(params.toolkit);
      if (!toolkit)
        throw new Error("request_connection needs a non-empty toolkit slug.");
      const reason = params.reason?.trim();
      recordPendingInteraction({
        kind: "connect",
        toolkit,
        ...(reason ? { reason } : {}),
      });
      return {
        content: [
          {
            type: "text" as const,
            text: "Houston is now showing the user a one-click card to connect this app in place of the chat input. End your turn now. Do not spell out the app's slug or any link in your reply, and do not ask the user to confirm — Houston sends you a message automatically once the connection is live.",
          },
        ],
        details: { toolkit },
      };
    },
  });

  // The in-chat custom-integration hand-off. When the user wants a service the
  // catalog can't offer, the model proposes it (name + base URL + auth scheme)
  // and Houston renders a secure setup card in place of the chat input where the
  // user supplies the API key. Like request_connection this holds NO credential
  // and makes no network call — it just records the proposal for this turn.
  const proposeCustomIntegration = defineTool({
    name: "propose_custom_integration",
    label: "Offer to add a custom integration",
    description:
      "Offer to connect a service that integration_search cannot find, by describing its HTTP API (name, HTTPS base URL, and how it authenticates). Houston shows the user a secure card, in place of the chat input, where they paste their API key — NEVER ask the user to type an API key or secret into the chat; the card collects it safely. End your turn right after calling this; Houston messages you once the service is connected.",
    promptSnippet:
      "Offer to add a custom service that integration_search cannot find",
    parameters: ProposeCustomParams,
    executionMode: "sequential",
    async execute(_id: string, params: ProposeCustomParams) {
      const name = params.name.trim();
      const baseUrl = params.baseUrl.trim();
      const description = params.description.trim();
      const authField = params.authField.trim();
      if (!name)
        throw new Error("propose_custom_integration needs a non-empty name.");
      if (!baseUrl)
        throw new Error(
          "propose_custom_integration needs a non-empty baseUrl.",
        );
      if (!description)
        throw new Error(
          "propose_custom_integration needs a non-empty description.",
        );
      if (!authField)
        throw new Error(
          "propose_custom_integration needs a non-empty authField (the header or query parameter name).",
        );
      const prefix = params.authPrefix;
      const auth: CustomIntegrationAuth =
        params.authType === "header"
          ? { type: "header", header: authField, ...(prefix ? { prefix } : {}) }
          : { type: "query", param: authField };
      const reason = params.reason?.trim();
      recordPendingInteraction({
        kind: "custom_integration",
        proposal: { name, baseUrl, auth, description },
        ...(reason ? { reason } : {}),
      });
      return {
        content: [
          {
            type: "text" as const,
            text: "Houston is now showing the user a secure card to add this service in place of the chat input. End your turn now. Do NOT ask the user to paste an API key or any secret into the chat, and do not ask them to confirm — Houston sends you a message automatically once the service is connected.",
          },
        ],
        details: { name },
      };
    },
  });

  return [search, execute, requestConnection, proposeCustomIntegration];
}

/** The tool names — pi's allowlist needs the names alongside the objects. */
export const INTEGRATION_TOOL_NAMES = [
  "integration_search",
  "integration_execute",
  "request_connection",
  "propose_custom_integration",
];
