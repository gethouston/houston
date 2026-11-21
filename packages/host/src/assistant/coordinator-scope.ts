import { AsyncLocalStorage } from "node:async_hooks";
import type { AssistantGateway } from "../routes/assistant-forward";

export interface CoordinatorScope {
  userId: string;
  agentSlug: string;
  gateway: AssistantGateway;
}

const scope = new AsyncLocalStorage<CoordinatorScope>();

export function runAsCoordinator<T>(value: CoordinatorScope, fn: () => T): T {
  return scope.run(value, fn);
}

export function coordinatorScope(): CoordinatorScope | undefined {
  return scope.getStore();
}

export function gatewayAgentSlug(): string | undefined {
  return coordinatorScope()?.agentSlug ?? process.env.HOUSTON_AGENT_SLUG;
}
