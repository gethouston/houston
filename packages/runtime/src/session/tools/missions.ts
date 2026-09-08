import { defineTool } from "@earendil-works/pi-coding-agent";
import type { ProviderOption } from "@houston/domain";
import { connectedProviderChoices } from "../../ai/provider-choices";
import { currentActingContext } from "../acting-context";
import { currentConversationId } from "../conversation-context";
import { currentTurnModel } from "../turn-model-context";
import {
  agentQuery,
  type ListMissionsParams,
  listMissionsParams,
  type StartMissionParams,
  startMissionParams,
  targetAgent,
  type UpdateMissionStatusParams,
  updateMissionStatusParams,
} from "./mission-params";
import {
  missionPin,
  missionRunsOn,
  resolveMissionPin,
} from "./mission-providers";
import {
  LIST_MISSIONS_TOOL_NAME,
  START_MISSION_TOOL_NAME,
  UPDATE_MISSION_STATUS_TOOL_NAME,
} from "./mission-tool-names";
import type { SandboxFetch } from "./sandbox-fetch";
import { CONVERSATION_ID_HEADER } from "./save-learning";

/**
 * The agent's mission-board tools (PRODUCT-1244): start a new mission, see a
 * board, and move a finished mission — so a "planning" chat can fan work out
 * into separate missions and review them, all through the SAME board the user
 * watches. Each tool acts on the calling agent's own board unless it names
 * another agent; the personal assistant, which keeps no board of its own, must
 * always name one (mission-params.ts).
 *
 * Same trust posture as `save_routine` / `save_learning`: the tools hold no
 * secret and carry only the per-sandbox HMAC token; the host owns the
 * merge-safe writes, stamps what the agent must not author (the agent-started
 * marker, attribution), resolves the named agent, fires the child turn through
 * the routine-firing channel, and enforces the guards (depth 1, running cap,
 * never the current conversation, never a running mission).
 */

export interface MissionToolOptions {
  call: SandboxFetch;
  /**
   * True when this runtime IS the user's personal assistant (the hidden
   * coordinator agent). It keeps no board, so every call must name the agent
   * whose board the work belongs on — and the tools say so to the model.
   */
  personalAssistant: boolean;
  /**
   * The providers this runtime can pin a mission to, snapshotted as the tool
   * defs are built (default: the runtime's own provider status). They become the
   * `provider` param's accepted values, so the model picks from a list instead
   * of inventing an id.
   */
  providers?: readonly ProviderOption[];
}

export function makeMissionTools(opts: MissionToolOptions) {
  const assistant = opts.personalAssistant;
  const providers = opts.providers ?? connectedProviderChoices();

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
    const res = await opts.call(`/sandbox/missions${path}`, {
      method,
      headers: {
        "content-type": "application/json",
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
      // still running, unknown agent or id) — relay them so the agent can
      // explain or correct itself.
      throw new Error(
        `mission request failed (${res.status}): ${detail.slice(0, 300)}`,
      );
    }
    return res.json();
  }

  const start = defineTool({
    name: START_MISSION_TOOL_NAME,
    label: "Start a mission",
    description: assistant
      ? "Start a new mission on the board of the agent you name, running in the background as its own chat. This is how work actually gets done: name the agent whose board this work belongs on, give it a complete standalone prompt, and it starts once your current turn ends. Check on it later with list_missions and read_mission on that same agent. On success, tell the user in plain words which agent is doing it."
      : "Start a new mission on the user's board, running in the background as its own chat. Use when the user asks to kick off separate workstreams, or a task splits into independent pieces they want tracked separately. The mission starts after your current turn ends; check on it later with list_missions and read_mission. Start only missions the user asked for or clearly wants, never more than a few at once. On success, tell the user in plain words which mission you started.",
    promptSnippet: "Start a new mission on the board",
    parameters: startMissionParams(assistant, providers),
    executionMode: "sequential",
    async execute(_id, params: StartMissionParams, signal) {
      const agent = targetAgent(params.agent, assistant);
      const inherited = currentTurnModel();
      const pin = missionPin(
        resolveMissionPin(params, providers, inherited?.provider),
        inherited,
      );
      const body = {
        ...params,
        ...(agent ? { agent } : {}),
        // Resolved (id, display name or alias) BEFORE the inheritance default,
        // so a mission never carries a name the host has to guess at — and a
        // value nothing matches is refused above, naming every id it could
        // have used.
        ...pin,
      };
      const r = (await call("POST", "/start", body, signal)) as {
        id: string;
        title: string;
      };
      return {
        content: [
          {
            type: "text" as const,
            text: `Started mission "${r.title}" (id ${r.id})${agent ? ` on ${agent}` : ""}.${missionRunsOn(pin, providers)} It starts after this turn ends - check it later with list_missions or read_mission.`,
          },
        ],
        details: {
          id: r.id,
          title: r.title,
          ...(agent ? { agent } : {}),
          ...pin,
        },
      };
    },
  });

  const list = defineTool({
    name: LIST_MISSIONS_TOOL_NAME,
    label: "Check the board",
    description: assistant
      ? "See one agent's mission board: every mission on it with its status. Statuses: 'running' (working or waiting to start), 'needs_you' (finished or blocked, awaiting review), 'error' (failed), 'done', 'archived'. Name the agent whose board you want - use it to check on work you started there, and to avoid starting the same thing twice."
      : "See the user's mission board: every mission with its status. Statuses: 'running' (working or waiting to start), 'needs_you' (finished or blocked, awaiting review), 'error' (failed), 'done', 'archived'. Use it to check on missions you started, avoid duplicates before starting new ones, or answer what's in flight.",
    promptSnippet: "List the missions on the board",
    parameters: listMissionsParams(assistant),
    executionMode: "sequential",
    async execute(_id, params: ListMissionsParams, signal) {
      const agent = targetAgent(params.agent, assistant);
      const r = (await call("GET", agentQuery(agent), undefined, signal)) as {
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
    parameters: updateMissionStatusParams(assistant),
    executionMode: "sequential",
    async execute(_id, params: UpdateMissionStatusParams, signal) {
      const agent = targetAgent(params.agent, assistant);
      const r = (await call(
        "POST",
        "/status",
        { ...params, ...(agent ? { agent } : {}) },
        signal,
      )) as {
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
