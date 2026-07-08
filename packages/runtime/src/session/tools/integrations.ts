import { defineTool } from "@earendil-works/pi-coding-agent";
import type {
  CustomIntegrationAuth,
  McpServerAuth,
} from "@houston/runtime-client";
import { type Static, Type } from "typebox";
import { currentActingContext } from "../acting-context";
import {
  recordConnection,
  recordCustomIntegration,
  recordMcpServer,
  recordSignin,
} from "../interaction";

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

const ProposeMcpParams = Type.Object({
  name: Type.String({
    description:
      "Short, human-readable name for the MCP server (e.g. 'Acme Tracker'). Shown to the user on the setup card.",
  }),
  url: Type.String({
    description:
      "The MCP server's HTTPS endpoint URL (Streamable HTTP transport, e.g. 'https://mcp.acme.com/sse'). Must not embed any credentials.",
  }),
  authType: Type.Union(
    [Type.Literal("none"), Type.Literal("bearer"), Type.Literal("header")],
    {
      description:
        "How the server authenticates: 'none' for a public server, 'bearer' for a bearer token, 'header' for a custom header whose value is the secret.",
    },
  ),
  authHeader: Type.Optional(
    Type.String({
      description:
        "The name of the custom header that carries the secret value (e.g. 'X-Api-Key'). Required for 'header' auth; leave unset otherwise.",
    }),
  ),
  description: Type.Optional(
    Type.String({
      description:
        "One or two sentences on what the server does and what you'd use it for. Future agent turns read this to know when to reach for it.",
    }),
  ),
  reason: Type.Optional(
    Type.String({
      description:
        "A short, plain-language reason to show the user for why this server is needed.",
    }),
  ),
});
type ProposeMcpParams = Static<typeof ProposeMcpParams>;

/**
 * Canonical toolkit slug: trimmed + lowercased, matching the connection/catalog
 * lists the connect card compares against (app-side `normalizeToolkitSlug`). A
 * model-authored slug can carry stray casing or whitespace; comparing raw would
 * silently miss a real connection and leave the card stuck on "Connect".
 */
function normalizeToolkitSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/**
 * The `code` the host stamps on its OWN actionable error signals (409
 * "signin_required", 503 "integrations_not_configured"). Returns it, or
 * undefined for a body that carries none — including any upstream error the
 * host relays verbatim during a transient outage, which must NOT be read as one
 * of those states. A non-JSON or malformed body is simply uncoded.
 */
function signalCode(detail: string): string | undefined {
  try {
    const body: unknown = JSON.parse(detail);
    if (body && typeof body === "object") {
      const { code } = body as { code?: unknown };
      if (typeof code === "string") return code;
    }
  } catch {
    // Non-JSON body (e.g. an HTML proxy error page) → uncoded, generic error.
  }
  return undefined;
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
  /**
   * Non-fatal per-provider failures (e.g. an MCP server was unreachable this
   * turn). Human-readable, already localized by the host. Surfaced verbatim to
   * the model so a failing server is never silently dropped from the results.
   */
  warnings?: string[];
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

/**
 * The host reports non-fatal per-provider failures (an MCP server unreachable
 * this turn, say) as human-readable warnings. Surface them verbatim after the
 * matches so a failing server is never silently dropped from the results.
 */
function formatWarnings(warnings: string[] | undefined): string {
  if (!warnings?.length) return "";
  return `\n\n${warnings.join("\n")}`;
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
      // The host tags its OWN actionable signals with a stable `code` on the
      // JSON error body. A relayed upstream error (a transient gateway/provider
      // outage the host passes through VERBATIM) carries the upstream's status
      // + body and NO such code — so we classify on the code, never the bare
      // status, and let any uncoded failure fall through to the generic error
      // below rather than a false "sign in" / "not set up" claim.
      const code = signalCode(detail);
      // signin_required (409): integrations can't act for this user yet (on
      // desktop: they're signed out of Houston, so the gateway has no session to
      // forward) — a normal, actionable state. Queue a signin step in THIS
      // turn's interaction flow so Houston renders a sign-in card in place of
      // the chat input, then tell the model to keep queuing what it needs and
      // end its turn.
      if (code === "signin_required") {
        recordSignin({
          reason: "Sign in to Houston to use your connected apps.",
        });
        throw new Error(
          "The user is signed out of Houston, so connected apps can't act for them yet. A sign-in card has been queued in the interaction flow. Queue any request_connection you still need (it will follow the sign-in step), then end your turn. Do NOT tell the user to open Settings — Houston sends you a message automatically once they're signed in.",
        );
      }
      // integrations_not_configured (503): connected apps are not set up in this
      // Houston install (dev with no key, self-host that never set
      // COMPOSIO_API_KEY). A closed, honest state: there is nothing to sign into
      // or connect here.
      if (code === "integrations_not_configured") {
        throw new Error(
          "Connected apps are not set up in this Houston install. Tell the user plainly that connected apps aren't available here (a self-hoster enables them by setting COMPOSIO_API_KEY), and do not offer to connect any apps.",
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
      const { items, accounts, warnings } = await post<SearchResult>(
        "search",
        { query: params.query },
        signal,
      );
      if (items.length === 0) {
        // Even with no matches, a failing server must be surfaced (never
        // silently dropped) — append any warnings to the empty-result text.
        return {
          content: [
            {
              type: "text" as const,
              text: `No actions found for "${params.query}".${formatWarnings(warnings)}`,
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
      // can pass the right one on execute; per-server warnings ride at the end.
      const text = `${body}${formatMultiAccounts(accounts)}${formatWarnings(warnings)}`;
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

  // The in-chat connect hand-off. Appends a connect step to this turn's
  // interaction sequence (carried on the terminal `done` frame → a card rendered
  // in place of the chat input that walks the user through every queued step).
  // Gated with the integration tools because it only makes sense where the user
  // can actually connect apps. Holds no credential and makes no network call —
  // it just records the request.
  const requestConnection = defineTool({
    name: REQUEST_CONNECTION_TOOL_NAME,
    label: "Ask the user to connect an app",
    description:
      "Ask the user to connect one of their apps (Gmail, Slack, Notion, and many more) when an action needs it. This adds a connect step to the one interaction card Houston shows in place of the chat input; queue any questions you also need (via ask_user) in the SAME turn, then end your turn. Never spell out the app's slug or a link in your reply — Houston sends you a message automatically once the connection is live.",
    promptSnippet: "Ask the user to connect an app so an action can run",
    parameters: ConnectParams,
    executionMode: "sequential",
    async execute(_id: string, params: ConnectParams) {
      const toolkit = normalizeToolkitSlug(params.toolkit);
      if (!toolkit)
        throw new Error("request_connection needs a non-empty toolkit slug.");
      const reason = params.reason?.trim();
      recordConnection({ toolkit, ...(reason ? { reason } : {}) });
      return {
        content: [
          {
            type: "text" as const,
            text: "This app was added as a connect step to the one interaction card Houston shows the user in place of the chat input. Queue everything else this task needs now (call ask_user for any questions in this same turn), then end your turn. Do not spell out the app's slug or any link in your reply, and do not ask the user to confirm — Houston sends you a message automatically once the connection is live.",
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
      recordCustomIntegration({
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

  // The in-chat MCP-server hand-off. When the user wants to connect a remote MCP
  // server (Streamable HTTP transport), the model proposes it (name + URL + auth
  // scheme) and Houston renders a secure setup card in place of the chat input
  // where the user supplies any bearer token or header value. Like the other
  // hand-offs this holds NO secret and makes no network call — it just records
  // the proposal for this turn.
  const proposeMcpServer = defineTool({
    name: "propose_mcp_server",
    label: "Offer to connect an MCP server",
    description:
      "Offer to connect a remote MCP server (Model Context Protocol, Streamable HTTP) by describing it (name, HTTPS URL, and how it authenticates). Use this when the user wants to connect an MCP server. Houston shows the user a secure card, in place of the chat input, where they paste any token or header value — NEVER ask the user to type a token or secret into the chat; the card collects it safely. End your turn right after calling this; Houston messages you once the server is connected.",
    promptSnippet: "Offer to connect a remote MCP server the user asks for",
    parameters: ProposeMcpParams,
    executionMode: "sequential",
    async execute(_id: string, params: ProposeMcpParams) {
      const name = params.name.trim();
      const url = params.url.trim();
      if (!name) throw new Error("propose_mcp_server needs a non-empty name.");
      if (!url) throw new Error("propose_mcp_server needs a non-empty url.");
      let auth: McpServerAuth;
      if (params.authType === "header") {
        const header = params.authHeader?.trim();
        if (!header)
          throw new Error(
            "propose_mcp_server needs a non-empty authHeader when authType is 'header'.",
          );
        auth = { type: "header", header };
      } else if (params.authType === "bearer") {
        auth = { type: "bearer" };
      } else {
        auth = { type: "none" };
      }
      const description = params.description?.trim();
      const reason = params.reason?.trim();
      recordMcpServer({
        proposal: {
          name,
          url,
          auth,
          ...(description ? { description } : {}),
        },
        ...(reason ? { reason } : {}),
      });
      return {
        content: [
          {
            type: "text" as const,
            text: "Houston is now showing the user a secure card to connect this MCP server in place of the chat input. End your turn now. Do NOT ask the user to paste a token or any secret into the chat, and do not ask them to confirm — Houston sends you a message automatically once the server is connected.",
          },
        ],
        details: { name },
      };
    },
  });

  return [
    search,
    execute,
    requestConnection,
    proposeCustomIntegration,
    proposeMcpServer,
  ];
}

/**
 * The in-chat connect hand-off tool. A blocking/interactive tool (it waits for
 * the user to connect an app), so — like `ask_user` — it is EXCLUDED from
 * Autopilot ("auto") mode, which never waits on the user. Named here so the
 * mode tool filter can reference it without a string literal.
 */
export const REQUEST_CONNECTION_TOOL_NAME = "request_connection";

/**
 * The two proposal hand-off tools. Like `request_connection` they are
 * blocking/interactive — each ends the turn on a secure setup card the user
 * fills in — so both are EXCLUDED from Autopilot ("auto") mode. Named here so the
 * mode tool filter can reference them without string literals.
 */
export const PROPOSE_CUSTOM_INTEGRATION_TOOL_NAME =
  "propose_custom_integration";
export const PROPOSE_MCP_SERVER_TOOL_NAME = "propose_mcp_server";

/** The tool names — pi's allowlist needs the names alongside the objects. */
export const INTEGRATION_TOOL_NAMES = [
  "integration_search",
  "integration_execute",
  REQUEST_CONNECTION_TOOL_NAME,
  PROPOSE_CUSTOM_INTEGRATION_TOOL_NAME,
  PROPOSE_MCP_SERVER_TOOL_NAME,
];
