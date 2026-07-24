import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { currentActingContext } from "../acting-context";
import { recordApproval, recordConnection, recordSignin } from "../interaction";
import { assertNotPlanMode } from "../live-mode-gate";
import { currentTurnMode } from "../turn-mode-context";

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
  intent: Type.Optional(
    Type.String({
      maxLength: 200,
      description:
        'REQUIRED whenever this action changes something (send/create/delete/update): ONE short confirmation question, in the USER\'S language, covering the FULL scope of what is about to happen — e.g. "Should I send the 30 invites?" or "¿Borro los 5 eventos?". Houston shows it on a single confirmation card. Omit for pure reads.',
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

/** The host's action-approval payload (409 "approval_required" on `execute`). */
interface ApprovalPayload {
  toolkit: string;
  action: string;
  /** The agent-phrased confirmation question the host echoed back from the
   *  `execute` call's `intent`; carried onto the approval step so the card asks
   *  it in the user's words. Absent when the model supplied none. */
  intent?: string;
  params?: Record<string, string>;
  /** How many params the host dropped past the card's row cap (present only when
   *  > 0); passed through to the approval step so the card can surface it. */
  paramsOmitted?: number;
  paramsHash: string;
}

/**
 * Parse the `approval` object off a 409 body, TOLERANTLY: toolkit/action/
 * paramsHash must be strings, params (optional) a record of strings,
 * paramsOmitted (optional) a number, intent (optional) a string (any other type
 * is simply dropped, never a parse failure). A malformed payload returns
 * undefined so the caller falls through to the generic error throw rather than
 * queueing a broken approval card.
 */
function parseApproval(detail: string): ApprovalPayload | undefined {
  try {
    const body: unknown = JSON.parse(detail);
    if (!body || typeof body !== "object") return undefined;
    const { approval } = body as { approval?: unknown };
    if (!approval || typeof approval !== "object") return undefined;
    const { toolkit, action, intent, params, paramsOmitted, paramsHash } =
      approval as {
        toolkit?: unknown;
        action?: unknown;
        intent?: unknown;
        params?: unknown;
        paramsOmitted?: unknown;
        paramsHash?: unknown;
      };
    if (
      typeof toolkit !== "string" ||
      typeof action !== "string" ||
      typeof paramsHash !== "string"
    )
      return undefined;
    if (paramsOmitted !== undefined && typeof paramsOmitted !== "number")
      return undefined;
    let parsedParams: Record<string, string> | undefined;
    if (params !== undefined) {
      if (
        typeof params !== "object" ||
        params === null ||
        !Object.values(params as Record<string, unknown>).every(
          (v) => typeof v === "string",
        )
      )
        return undefined;
      parsedParams = params as Record<string, string>;
    }
    return {
      toolkit,
      action,
      paramsHash,
      // Tolerant: keep a string intent, drop anything else silently.
      ...(typeof intent === "string" ? { intent } : {}),
      ...(parsedParams ? { params: parsedParams } : {}),
      ...(paramsOmitted !== undefined ? { paramsOmitted } : {}),
    };
  } catch {
    // Non-JSON body → not an approval signal; generic error.
  }
  return undefined;
}

/**
 * Thrown by `post()` when the host gated an integration `execute` (409
 * "approval_required"). Module-private: the `execute` tool catches it, queues an
 * approval step, and RETURNS a normal (non-error) instruction — being gated is
 * an expected state, not a tool failure.
 */
class ApprovalRequiredError extends Error {
  constructor(readonly payload: ApprovalPayload) {
    super("approval required");
    this.name = "ApprovalRequiredError";
  }
}

/**
 * Thrown by `post()` when the gateway REFUSED an integration `execute` because
 * the action's app is outside this agent's allowlist (403 "toolkit_not_allowed"
 * — the app is turned OFF in the agent's Permissions tab). Module-private: the
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
    // Autopilot turns act un-gated: tell the host this is an "auto" turn so its
    // action-approval gate lets the call through. Any other mode (or outside a
    // turn) omits the header, so the host gates un-approved actions as normal.
    const auto = currentTurnMode() === "auto";
    const res = await fetch(`${base}/sandbox/integrations/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.sandboxToken}`,
        ...(acting?.actingAs ? { "x-houston-acting-as": acting.actingAs } : {}),
        ...(acting?.actingUser
          ? { "x-houston-acting-user": acting.actingUser }
          : {}),
        ...(auto ? { "x-houston-turn-mode": "auto" } : {}),
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
      // approval_required (409): the host gated this integration action pending
      // the user's permission (a non-Autopilot turn). Parse the approval payload
      // and throw the typed error the execute tool turns into a queued approval
      // card. A malformed payload falls through to the generic error below.
      if (code === "approval_required") {
        const approval = parseApproval(detail);
        if (approval) throw new ApprovalRequiredError(approval);
      }
      // toolkit_not_allowed (403): the gateway walled this action off because
      // its app is outside this agent's allowlist (turned off in the agent's
      // Permissions tab). A normal, user-fixable policy state — throw the typed
      // error the execute tool turns into guidance, never a raw failure.
      if (code === "toolkit_not_allowed") {
        throw new ToolkitNotAllowedError();
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
        // Genuinely empty: not a policy block, not "unavailable" - no such app
        // or action was found. The prompt tells the model to say so plainly.
        return {
          content: [
            {
              type: "text" as const,
              text: `No matching app or action found for "${params.query}". This is a genuine not-found: no such app or action exists here. It does NOT mean an app is blocked or withheld by policy.`,
            },
          ],
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
      const connectable = slugsWith("connectable");
      if (connectable.length > 0) {
        parts.push(
          `These apps exist but are not connected yet (${connectable.join(", ")}). ${REQUEST_CONNECTION_GUIDANCE}`,
        );
      }
      const blocked = slugsWith("blocked");
      if (blocked.length > 0) {
        parts.push(
          `These apps are turned off for this agent (${blocked.join(", ")}). Tell the user they can be switched on in this agent's Permissions tab (someone who manages the agent can do it; otherwise they should ask whoever does). Do NOT call request_connection for these, and never imply Houston lacks them.`,
        );
      }
      return {
        content: [{ type: "text" as const, text: parts.join("\n\n") }],
        details: {
          matches: items.length,
          actions: items.filter((m) => m.action).map((m) => m.action),
        },
      };
    },
  });

  const execute = defineTool<
    typeof ExecuteParams,
    // Pinned so the success path ({ action }), the gated path ({ action,
    // queuedApproval: true }), and the walled-off path ({ action,
    // appTurnedOff: true }) share ONE details type — the flags are present only
    // in their respective states.
    { action: string; queuedApproval?: boolean; appTurnedOff?: boolean }
  >({
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
      // Live gate for the mid-turn Mode-pill switch: an execute/auto-built turn
      // may now be running in Plan — acting on the user's apps is off-limits.
      // The `x-houston-turn-mode: auto` header in post() reads the SAME live
      // mode, so a mid-turn flip to/from Autopilot re-gates approvals at once.
      assertNotPlanMode("take real-world actions on the user's connected apps");
      let result: ActionResult;
      try {
        result = await post<ActionResult>(
          "execute",
          {
            action: params.action,
            params: params.params ?? {},
            // The agent-phrased confirmation question; the host echoes it back on
            // the 409 approval payload so the card asks it in the user's words.
            ...(params.intent ? { intent: params.intent } : {}),
          },
          signal,
        );
      } catch (err) {
        // Gated by the host pending the user's permission: NOT a tool failure.
        // Queue an approval card for this turn and return a normal instruction
        // telling the model to end its turn — Houston re-prompts it once the
        // user decides. (Signin/not-configured keep their throw; only approval
        // is a normal, expected state.)
        if (err instanceof ApprovalRequiredError) {
          recordApproval(err.payload);
          const action = err.payload.action;
          return {
            content: [
              {
                type: "text" as const,
                text: `This action needs the user's go-ahead. Houston queued a confirmation card for "${action}" that the user will see when you end your turn. Do not run this action again now and do not ask for confirmation in text. Queue anything else the task needs (ask_user questions, request_connection) in this same turn, then end your turn. Once the user confirms, Houston clears "${action}" for a short while and sends you a message — then re-issue it (including any repeats of this same action in the batch) without asking again.`,
              },
            ],
            details: { action, queuedApproval: true },
          };
        }
        // The gateway walled this action off: its app is outside this agent's
        // allowlist (turned off in the agent's Permissions tab). NOT a tool
        // failure — return guidance the model relays to the user, and do not
        // retry until the user confirms the app is switched on.
        if (err instanceof ToolkitNotAllowedError) {
          const action = params.action;
          return {
            content: [
              {
                type: "text" as const,
                text: `This action's app is turned off for this agent, so it can't run. Tell the user it can be switched on in this agent's Permissions tab (someone who manages the agent can do it; otherwise they should ask whoever does). Do not retry this action until the user confirms it's enabled, and never imply Houston lacks the app.`,
              },
            ],
            details: { action, appTurnedOff: true },
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
