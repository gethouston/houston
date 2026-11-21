import { CONFIG_SEED_KEY } from "@houston/domain/first-day-config";
import { AGENT_SETUP_AGENT_MODE } from "@houston/domain/first-day-mode";
import {
  buildFirstDayPrompt,
  firstDayBrief,
} from "@houston/domain/first-day-prompt";
import {
  type Activity,
  encodeAutoContinue,
  type FirstDayStartResult,
} from "@houston/protocol";
import { streamReplySafe } from "./chat";
import { json } from "./http";
import * as state from "./state";
import { emitDomain, fileKey, state as store } from "./state-store";

function config(agentId: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(
      state.readAgentFile(agentId, CONFIG_SEED_KEY) || "{}",
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function recordStarted(agentId: string): void {
  const next = { ...config(agentId), firstDay: "started" };
  store.files.set(fileKey(agentId, CONFIG_SEED_KEY), JSON.stringify(next));
  emitDomain("ConfigChanged", agentId);
}

function answer(
  status: 200 | 201,
  outcome: FirstDayStartResult["outcome"],
  task: Activity,
  agentId: string,
  role: string | null,
): Response {
  const arrival = config(agentId).arrival;
  const body: FirstDayStartResult = {
    outcome,
    mission: {
      id: task.id,
      sessionKey: task.session_key ?? `activity-${task.id}`,
      title: task.title,
    },
    role,
    ...(arrival === "created" || arrival === "imported" ? { arrival } : {}),
  };
  return json(body, status);
}

export function startFirstDay(
  agentId: string,
  body: Record<string, unknown>,
): Response {
  const agent = state.listAgents().find((a) => a.id === agentId);
  if (!agent) return json({ error: "agent not found" }, 404);
  const brief = firstDayBrief(state.readAgentFile(agentId, "CLAUDE.md"));
  const role = brief?.role ?? null;
  const existing = state
    .listActivities(agentId)
    .find((a) => a.agent === AGENT_SETUP_AGENT_MODE);
  const pending = config(agentId).firstDay === "pending";
  if (existing) {
    if (pending) recordStarted(agentId);
    return answer(200, "existing", existing, agentId, role);
  }
  if (!pending)
    return json(
      { error: "no first day waiting", code: "first_day_not_pending" },
      409,
    );
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : "Getting set up";
  const task = state.createActivity(agentId, {
    title,
    description: "",
    agent: AGENT_SETUP_AGENT_MODE,
  });
  const locale = typeof body.locale === "string" ? body.locale : "en";
  streamReplySafe(
    agentId,
    `activity-${task.id}`,
    encodeAutoContinue(buildFirstDayPrompt(agent.name, locale, brief)),
    undefined,
  );
  recordStarted(agentId);
  return answer(201, "started", task, agentId, role);
}
