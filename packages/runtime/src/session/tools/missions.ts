import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { currentActingContext } from "../acting-context";
import { currentConversationId } from "../conversation-context";
import { CONVERSATION_ID_HEADER } from "./save-learning";

/**
 * The agent's mission-board tools (PRODUCT-1244): start a new mission for
 * itself, see the board, and move a finished mission — so a "planning" chat can
 * fan work out into separate missions and review them, all through the SAME
 * board the user watches.
 *
 * Same trust posture as `save_routine` / `save_learning`: the tools hold no
 * secret and carry only the per-sandbox HMAC token; the host owns the
 * merge-safe writes, stamps what the agent must not author (the agent-started
 * marker, attribution), fires the child turn through the routine-firing
 * channel, and enforces the guards (depth 1, running cap, never the current
 * conversation, never a running mission).
 */
export const START_MISSION_TOOL_NAME = "start_mission";
export const LIST_MISSIONS_TOOL_NAME = "list_missions";
export const UPDATE_MISSION_STATUS_TOOL_NAME = "update_mission_status";

const StartMissionParams = Type.Object({
  title: Type.String({
    description:
      "Short mission title in the user's language, as it should read on their board.",
  }),
  prompt: Type.String({
    description:
      "Complete standalone instructions for the new mission. It cannot see this conversation - include every fact, constraint, and piece of context it needs.",
  }),
  mode: Type.Optional(
    Type.Union(
      [Type.Literal("execute"), Type.Literal("plan"), Type.Literal("auto")],
      {
        description:
          "How the mission runs: 'execute' may ask the user questions (default), 'auto' never asks and finishes with what it has, 'plan' proposes a plan for the user to approve first.",
      },
    ),
  ),
  provider: Type.Optional(
    Type.String({
      description:
        "Pin a specific AI provider for the mission (omit to use the agent's current one).",
    }),
  ),
  model: Type.Optional(
    Type.String({
      description: "Pin a specific model id (omit for the provider's default).",
    }),
  ),
});
type StartMissionParams = Static<typeof StartMissionParams>;

const ListMissionsParams = Type.Object({});

const UpdateMissionStatusParams = Type.Object({
  id: Type.String({ description: "The mission id, from list_missions." }),
  status: Type.Union([Type.Literal("done"), Type.Literal("archived")], {
    description:
      "'done' marks a reviewed mission complete; 'archived' puts it away.",
  }),
});
type UpdateMissionStatusParams = Static<typeof UpdateMissionStatusParams>;

export interface MissionToolOptions {
  baseUrl: string;
  /** The per-sandbox HMAC token (HOUSTON_SANDBOX_TOKEN). */
  sandboxToken: string;
}

export function makeMissionTools(opts: MissionToolOptions) {
  const base = opts.baseUrl.replace(/\/$/, "");

  /** Shared authed call; forwards the acting identity + this conversation's id
   *  so the host can stamp attribution and enforce the self/depth guards. */
  async function call(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    const acting = currentActingContext();
    const conversationId = currentConversationId();
    const res = await fetch(`${base}/sandbox/missions${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.sandboxToken}`,
        ...(acting?.actingAs ? { "x-houston-acting-as": acting.actingAs } : {}),
        ...(acting?.actingUser
          ? { "x-houston-acting-user": acting.actingUser }
          : {}),
        ...(conversationId ? { [CONVERSATION_ID_HEADER]: conversationId } : {}),
      },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // The host's error bodies are agent-actionable plain language (cap hit,
      // still running, unknown id) — relay them so the agent can explain or
      // correct itself.
      throw new Error(
        `mission request failed (${res.status}): ${detail.slice(0, 300)}`,
      );
    }
    return res.json();
  }

  const start = defineTool({
    name: START_MISSION_TOOL_NAME,
    label: "Start a mission",
    description:
      "Start a new mission on the user's board, running in the background as its own chat. Use when the user asks to kick off separate workstreams, or a task splits into independent pieces they want tracked separately. The mission starts after your current turn ends; check on it later with list_missions and read_mission. Start only missions the user asked for or clearly wants, never more than a few at once. On success, tell the user in plain words which mission you started.",
    promptSnippet: "Start a new mission on the board",
    parameters: StartMissionParams,
    executionMode: "sequential",
    async execute(_id, params: StartMissionParams, signal) {
      const r = (await call("POST", "/start", params, signal)) as {
        id: string;
        title: string;
      };
      return {
        content: [
          {
            type: "text" as const,
            text: `Started mission "${r.title}" (id ${r.id}). It runs after this turn ends - check it later with list_missions or read_mission.`,
          },
        ],
        details: { id: r.id, title: r.title },
      };
    },
  });

  const list = defineTool({
    name: LIST_MISSIONS_TOOL_NAME,
    label: "Check the board",
    description:
      "See the user's mission board: every mission with its status. Statuses: 'running' (working or waiting to start), 'needs_you' (finished or blocked, awaiting review), 'error' (failed), 'done', 'archived'. Use it to check on missions you started, avoid duplicates before starting new ones, or answer what's in flight.",
    promptSnippet: "List the missions on the board",
    parameters: ListMissionsParams,
    executionMode: "sequential",
    async execute(_id, _params, signal) {
      const r = (await call("GET", "", undefined, signal)) as {
        missions: unknown[];
      };
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(r.missions, null, 2) },
        ],
        details: { count: r.missions.length },
      };
    },
  });

  const updateStatus = defineTool({
    name: UPDATE_MISSION_STATUS_TOOL_NAME,
    label: "Move a mission",
    description:
      "Move a finished mission on the user's board to 'done' (reviewed and complete) or 'archived' (put away). Only works on missions that already finished - never one still running, and never the mission this chat belongs to. Move a mission only when the user asked you to manage it, or you started it yourself and reviewed its outcome with read_mission first.",
    promptSnippet: "Move a mission to done or archived",
    parameters: UpdateMissionStatusParams,
    executionMode: "sequential",
    async execute(_id, params: UpdateMissionStatusParams, signal) {
      const r = (await call("POST", "/status", params, signal)) as {
        id: string;
        status: string;
      };
      return {
        content: [
          {
            type: "text" as const,
            text: `Moved the mission to ${r.status}. Tell the user in plain words.`,
          },
        ],
        details: { id: r.id, status: r.status },
      };
    },
  });

  return [start, list, updateStatus];
}
