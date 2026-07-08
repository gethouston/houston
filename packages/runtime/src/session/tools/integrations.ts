import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { currentActingContext } from "../acting-context";
import { recordConnection, recordSignin } from "../interaction";

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
}

/**
 * The instruction appended to search results (and connection-shaped execute
 * failures) that teaches the model the in-chat connect hand-off: call the
 * `request_connection` tool, which records the pending connection so Houston
 * renders a one-click connect card in place of the chat input.
 */
const REQUEST_CONNECTION_GUIDANCE =
  "To let the user connect an app, call the request_connection tool with that app's toolkit (the slug shown in the results). Houston shows the user a one-click connect card in place of the chat input, then automatically sends you a message once the connection is live so you can continue — do not ask the user to confirm.";
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
      const text = items.some((m) => m.connected === false)
        ? `${list}\n\nActions marked NOT CONNECTED will fail until the user connects that app. ${REQUEST_CONNECTION_GUIDANCE}`
        : list;
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
        details: { action: params.action },
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

  return [search, execute, requestConnection];
}

/**
 * The in-chat connect hand-off tool. A blocking/interactive tool (it waits for
 * the user to connect an app), so — like `ask_user` — it is EXCLUDED from
 * Autopilot ("auto") mode, which never waits on the user. Named here so the
 * mode tool filter can reference it without a string literal.
 */
export const REQUEST_CONNECTION_TOOL_NAME = "request_connection";

/** The tool names — pi's allowlist needs the names alongside the objects. */
export const INTEGRATION_TOOL_NAMES = [
  "integration_search",
  "integration_execute",
  REQUEST_CONNECTION_TOOL_NAME,
];
