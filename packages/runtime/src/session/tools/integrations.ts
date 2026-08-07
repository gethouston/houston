import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { currentActingContext } from "../acting-context";
import { recordConnection, recordSignin } from "../interaction";
import { assertNotPlanMode } from "../live-mode-gate";

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
      "Plain-language description of ONE specific thing you want to do (e.g. 'send an email', 'query analytics for the most active users'). A task with several independent steps gets one search per step — do not lump them into one loose query. Include the app name when you know it. Returns matching action slugs + their input parameters.",
  }),
  app: Type.Optional(
    Type.String({
      description:
        "The app the task names ('posthog', 'gmail', 'google sheets'). When set, results are scoped to ONLY that app's actions — ALWAYS set it when the user names the app. Omit it only when no app was named and you are discovering which app could do the task.",
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
      "The app's toolkit slug — the identifier from integration_search results (e.g. 'gmail', 'slack', 'notion').",
  }),
  reason: Type.Optional(
    Type.String({
      description:
        "A short user-facing reason shown verbatim to a non-technical user under the title 'Connect <App>'. Write it as a 'To ...' phrase, for example: 'To read your invoices and draft replies.'",
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

/**
 * Thrown by `post()` when the gateway REFUSED an integration `execute` because
 * the action's app is outside this agent's allowlist (403 "toolkit_not_allowed"
 * — the app is turned OFF in this agent's Settings, under Apps). Module-private: the
 * `execute` tool catches it and RETURNS a normal (non-error) instruction, since
 * being walled off is an expected policy state the user can fix, not a tool
 * failure. Classified on the stable `code`, never the bare 403 (a relayed
 * upstream 403 during an outage carries no such code).
 */
class ToolkitNotAllowedError extends Error {
  constructor() {
    super("toolkit not allowed");
    this.name = "ToolkitNotAllowedError";
  }
}

/**
 * Thrown by `post()` when the gateway REFUSED because the acting USER may not
 * use this agent at all (403 "not_assigned" — they are not among the people
 * with access to it). Module-private and handled by BOTH tools: like the
 * allowlist refusal, it is an expected, user-fixable permission state, so each
 * tool RETURNS guidance rather than failing. Classified on the stable `code`,
 * never the bare 403 (a relayed upstream 403 carries no such code).
 */
class NoAgentAccessError extends Error {
  constructor() {
    super("no agent access");
    this.name = "NoAgentAccessError";
  }
}

/**
 * Thrown by `post()` when Composio reports the EXECUTED action slug does not
 * exist at the current tool version ("Tool_ToolNotFound", code 2401). The slug
 * came from the model's context — a search result from earlier in a long chat
 * (Composio renames and removes actions over time) or an invented name — so the
 * recovery is mechanical: search again, run a slug from the fresh results
 * (PRODUCT-1266: the raw failure taught users that only a NEW chat "fixes"
 * integrations). Classified on Composio's stable error slug, which every relay
 * path carries verbatim inside the failure body (the cloud gateway wraps the
 * upstream 404 in a 502, the direct adapter surfaces it as a 500) — never the
 * bare status, which any transient upstream failure shares.
 */
class ActionNotFoundError extends Error {
  constructor() {
    super("action not found");
    this.name = "ActionNotFoundError";
  }
}

/**
 * What the model must say when the user may not use this agent. The gateway's
 * own wording is internal jargon ("this agent isn't assigned to you") and its
 * body is JSON — both would be paraphrased straight at a non-technical user, so
 * neither ever reaches the model. This does: the state, the human remedy, and
 * the exact place someone who manages the agent fixes it.
 */
const NO_AGENT_ACCESS_GUIDANCE =
  "The user does not have access to this agent, so its connected apps cannot be used for them. Tell the user plainly that someone who manages this agent needs to give them access to it in this agent's Settings, under People. Do not retry until they confirm they have access, do not call request_connection, and never imply Houston lacks the app or that something is broken.";

export interface IntegrationToolOptions {
  /** The host control-plane base URL (HOUSTON_CONTROL_PLANE_URL). */
  baseUrl: string;
  /** The per-sandbox HMAC token (HOUSTON_SANDBOX_TOKEN). */
  sandboxToken: string;
}

/**
 * The app-level status the host reports per search result (mirrors the host's
 * IntegrationAppStatus). It, not the raw `connected` boolean, drives which of
 * four speech acts the model performs — so a real-but-unconnected app is offered
 * for connection, an admin-blocked app sends the user to their admin, and only a
 * genuinely empty result means "no such app".
 */
type AppStatus = "connected" | "connectable" | "blocked" | "unknown";

interface ToolMatch {
  /** Empty ("") marks a toolkit-level entry: the app itself, no runnable action. */
  action: string;
  toolkit: string;
  description: string;
  inputParams?: unknown;
  /** Host-reported: does the user have this action's app connected? */
  connected?: boolean;
  /** Host-reported app status; absent only from an older host (derive it). */
  status?: AppStatus;
  /** Host-reported: the user's connected accounts for this app, present only
   *  when there is MORE than one — the model targets one via execute's
   *  `account`, or asks the user which to use. */
  accounts?: { id: string; label?: string }[];
}

/** Prefer the explicit status; fall back to the legacy connected boolean. */
function statusOf(m: ToolMatch): AppStatus {
  if (m.status) return m.status;
  return m.connected === false ? "connectable" : "connected";
}

/** The per-status tag shown after an app/action name in the rendered list. */
const STATUS_TAG: Record<AppStatus, string> = {
  connected: "",
  connectable: ", NOT CONNECTED",
  blocked: ", TURNED OFF",
  unknown: ", not a known app",
};

/** One rendered line: an action row, or a toolkit-level row (empty action). */
function renderMatch(m: ToolMatch, status: AppStatus): string {
  const tag = STATUS_TAG[status];
  if (m.action === "") {
    // A toolkit-level entry: the app itself, so the model learns the slug.
    return `- ${m.toolkit} (app${tag}): ${m.description}`;
  }
  const schema = m.inputParams
    ? `\n  params: ${JSON.stringify(m.inputParams)}`
    : "";
  return `- ${m.action} (${m.toolkit}${tag}): ${m.description}${schema}`;
}

/**
 * The instruction appended to search results (and connection-shaped execute
 * failures) that teaches the model the in-chat connect hand-off: call the
 * `request_connection` tool, which records the pending connection so Houston
 * renders a one-click connect card in place of the chat input.
 */
const REQUEST_CONNECTION_GUIDANCE =
  "To let the user connect an app, call the request_connection tool with that app's toolkit (the slug shown in the results). Houston shows the user a one-click connect card in place of the chat input, then automatically sends you a message once the connection is live so you can continue - do not ask the user to confirm.";

/**
 * Ceiling for one integration tool result, aligned with the code sandbox's
 * output limit (code-sandbox DEFAULT_LIMITS.maxOutputBytes). App APIs return
 * unbounded documents — a single GMAIL_FETCH_EMAILS with include_payload can
 * exceed 1 MB of JSON, which alone overflows a model's context window and
 * terminally errors the turn (every event-trigger run on a newsletter inbox
 * died this way, HOU-893). Truncate with an instructive marker instead: the
 * model re-runs the action with tighter parameters rather than the turn dying.
 */
const MAX_RESULT_CHARS = 256 * 1024;

/** Bound a tool-result text; the marker tells the model how to recover. */
function boundResultText(text: string, guidance: string): string {
  if (text.length <= MAX_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_RESULT_CHARS)}\n[result truncated: it exceeded the ${Math.floor(MAX_RESULT_CHARS / 1024)} KB tool-result limit and is cut off mid-document. ${guidance}]`;
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
      // toolkit_not_allowed (403): the gateway walled this action off because
      // its app is outside this agent's allowlist (turned off in the agent's
      // Settings, under Apps). A normal, user-fixable policy state — throw the typed
      // error the execute tool turns into guidance, never a raw failure.
      if (code === "toolkit_not_allowed") {
        throw new ToolkitNotAllowedError();
      }
      // not_assigned (403): the gateway refused because the acting user is not
      // one of the people with access to this agent — a permission state a
      // manager fixes in Permissions > this agent > People. Applies to search
      // and execute alike, so both tools turn the typed error into guidance.
      if (code === "not_assigned") {
        throw new NoAgentAccessError();
      }
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
      // Tool_ToolNotFound: Composio says the executed action slug does not
      // exist at the current tool version — a stale or invented slug, fixed by
      // searching again. The provider 404 reaches us wrapped in a relayed 5xx
      // whose body keeps Composio's stable error slug verbatim, so that slug
      // (not the outer status) is the classification key.
      if (path === "execute" && detail.includes("Tool_ToolNotFound")) {
        throw new ActionNotFoundError();
      }
      // Anything else. A 4xx is a REFUSAL, and its body is gateway/provider
      // JSON written for us, not for a person — the model reads whatever we
      // throw and paraphrases it straight at the user, so the body is REDACTED
      // and only the status (+ any unrecognized code, for the logs) survives. A
      // 5xx is a transient upstream failure whose body is genuinely diagnostic.
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
    // Pinned so the result path ({ matches, actions }) and the no-access path
    // (which adds the flag) share ONE details type.
    { matches: number; actions: string[]; noAgentAccess?: boolean }
  >({
    name: "integration_search",
    label: "Find an app action",
    description:
      "Search the user's apps (Gmail, Google Calendar, Slack, Notion, and many more) for an action you can run. Returns action slugs with their input parameters; actions marked NOT CONNECTED need the user to connect the app first (the result explains how to offer that). Call this first to discover what's possible, then run one with integration_execute. When the user names an app, pass it as `app` so results are scoped to it. Never conclude an app has no actions from an unscoped result where other apps dominate: if the app appears only as an app row (no actions), search again with `app` set to it before reporting any capability gap.",
    promptSnippet: "Search the user's connected apps for an action to run",
    parameters: SearchParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: SearchParams,
      signal: AbortSignal | undefined,
    ) {
      let items: ToolMatch[];
      try {
        ({ items } = await post<{ items: ToolMatch[] }>(
          "search",
          { query: params.query, ...(params.app ? { app: params.app } : {}) },
          signal,
        ));
      } catch (err) {
        // The user may not use this agent at all: not a search failure, a
        // permission state someone who manages the agent fixes. Return the
        // guidance so the model relays it in Houston's voice.
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
      if (items.length === 0) {
        // Genuinely empty: not a policy block, not "unavailable" - no such app
        // or action was found. The prompt tells the model to say so plainly —
        // but ONLY after the scoped retry (an unscoped result where other apps
        // dominate must never be read as "the named app has no actions").
        const text = params.app
          ? `No app matching "${params.app}" was found, and nothing matched "${params.query}". This is a genuine not-found: no such app exists here. It does NOT mean an app is blocked or withheld by policy. If the user may have misspelled the app, retry once with the corrected name before telling them plainly it is not available.`
          : `No matching app or action found for "${params.query}". If the task names an app, search again with \`app\` set to that app before concluding anything. Otherwise this is a genuine not-found: no such app or action exists here. It does NOT mean an app is blocked or withheld by policy.`;
        return {
          content: [{ type: "text" as const, text }],
          details: { matches: 0, actions: [] as string[] },
        };
      }
      const list = items.map((m) => renderMatch(m, statusOf(m))).join("\n");

      // Teach each speech act inline, only for the statuses actually present.
      const slugsWith = (s: AppStatus) => [
        ...new Set(
          items.filter((m) => statusOf(m) === s).map((m) => m.toolkit),
        ),
      ];
      const parts = [list];
      // Apps holding several connected accounts: name each account once so the
      // model can target one (execute's `account`) or ask the user which.
      const multiAccount = new Map<string, { id: string; label?: string }[]>();
      for (const m of items) {
        if (m.accounts && m.accounts.length > 1 && !multiAccount.has(m.toolkit))
          multiAccount.set(m.toolkit, m.accounts);
      }
      if (multiAccount.size > 0) {
        const lines = [...multiAccount].map(
          ([toolkit, accounts]) =>
            `- ${toolkit}: ${accounts
              .map((a) => `${a.id}${a.label ? ` (${a.label})` : ""}`)
              .join(", ")}`,
        );
        parts.push(
          `These apps have MULTIPLE accounts connected:\n${lines.join("\n")}\nWhen you run an action on one of these apps, pass integration_execute's \`account\` with the right account id. If the user has said which account to use (or the task implies it), pick it; if the choice matters and is ambiguous, ask the user first via ask_user, naming the accounts in plain words (their email or workspace name) — never show a raw account id to the user.`,
        );
      }
      const connectable = slugsWith("connectable");
      if (connectable.length > 0) {
        parts.push(
          `These apps exist but are not connected yet (${connectable.join(", ")}). ${REQUEST_CONNECTION_GUIDANCE}`,
        );
      }
      const blocked = slugsWith("blocked");
      if (blocked.length > 0) {
        parts.push(
          `These apps are turned off for this agent (${blocked.join(", ")}). Tell the user they can be switched on in this agent's Settings, under Apps (someone who manages the agent can do it; otherwise they should ask whoever does). Do NOT call request_connection for these, and never imply Houston lacks them.`,
        );
      }
      return {
        content: [
          {
            type: "text" as const,
            text: boundResultText(
              parts.join("\n\n"),
              "Search again with a more specific query to see the actions that were cut off.",
            ),
          },
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
    // Pinned so the success path ({ action }) and the refused paths (walled-off
    // app, no access to the agent, stale slug) share ONE details type — each
    // flag is present only in its state.
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
      "Run an action on one of the user's connected apps — e.g. send an email, create a calendar event, add a task. Pass the action slug from integration_search and its parameters. The user's own account is used automatically; you never handle credentials. When the app has several connected accounts (integration_search lists them), pass `account` to pick one.",
    promptSnippet: "Run an action on one of the user's connected apps",
    parameters: ExecuteParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: ExecuteParams,
      signal: AbortSignal | undefined,
    ) {
      // Live gate for the mid-turn Mode-pill switch: an execute/auto-built turn
      // may now be running in Plan — acting on the user's apps is off-limits.
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
        // The gateway walled this action off: its app is outside this agent's
        // allowlist (turned off in this agent's Settings, under Apps). NOT a tool
        // failure — return guidance the model relays to the user, and do not
        // retry until the user confirms the app is switched on.
        if (err instanceof ToolkitNotAllowedError) {
          const action = params.action;
          return {
            content: [
              {
                type: "text" as const,
                text: `This action's app is turned off for this agent, so it can't run. Tell the user it can be switched on in this agent's Settings, under Apps (someone who manages the agent can do it; otherwise they should ask whoever does). Do not retry this action until the user confirms it's enabled, and never imply Houston lacks the app.`,
              },
            ],
            details: { action, appTurnedOff: true },
          };
        }
        // The user may not use this agent at all — same shape: an expected
        // permission state, returned as guidance rather than a failure.
        if (err instanceof NoAgentAccessError) {
          return {
            content: [
              { type: "text" as const, text: NO_AGENT_ACCESS_GUIDANCE },
            ],
            details: { action: params.action, noAgentAccess: true },
          };
        }
        // The action slug does not exist (any more): a stale slug remembered
        // from earlier in the conversation, or an invented one. RETURN the
        // mechanical recovery — search again, use a fresh slug — so the model
        // completes the task in THIS chat instead of telling the user that
        // integrations are broken (PRODUCT-1266).
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
      const text = boundResultText(
        result.data ? JSON.stringify(result.data, null, 2) : "Done.",
        "Do not rely on the cut-off tail. Re-run the action with tighter parameters — fewer results, specific ids or fields, and without full payloads/bodies — to get what you need within the limit.",
      );
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
      // Live gate for the mid-turn Mode-pill switch: connecting an app sets up
      // a real-world capability, off-limits while planning. Autopilot is NOT
      // gated (HOU-853): the recorded step doesn't hold the turn open — it ends
      // the turn with the connect card, and the live connection auto-continues
      // the run (same shape as request_credential).
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
 * The in-chat connect hand-off tool. Available in EVERY acting mode, Autopilot
 * included (HOU-853): a missing connection is the one thing autonomy cannot
 * produce, and the recorded step doesn't hold the turn open — it ends the turn
 * with the connect card, and the live connection auto-continues the run (the
 * same rationale as `request_credential`). Only Plan mode withholds it (no
 * real-world setup while planning). Named here so the mode tool filter can
 * reference it without a string literal.
 */
export const REQUEST_CONNECTION_TOOL_NAME = "request_connection";

/** The tool names — pi's allowlist needs the names alongside the objects. */
export const INTEGRATION_TOOL_NAMES = [
  "integration_search",
  "integration_execute",
  REQUEST_CONNECTION_TOOL_NAME,
];
