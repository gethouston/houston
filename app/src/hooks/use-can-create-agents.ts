import { canCreateAgents } from "../lib/org-roles";
import { useCapabilities } from "./use-capabilities";
import { useOrgWriteLock } from "./use-org-write-lock";

/**
 * Whether the current user may create agents. Single-player builds and
 * owner/admin get `true`; a plain org `user` gets `false`, so every
 * create-agent affordance (sidebar add, empty-state CTAs, onboarding) hides.
 * The gateway rejects `POST /agents` from a `user` regardless — this only keeps
 * the UI honest.
 *
 * `isLoading` / `isError` mirror the capabilities fetch: while it's in flight
 * (or after it failed for real) `canCreate` is only the optimistic single-player
 * default, NOT a confirmed answer. Routing decisions that would strand a
 * multiplayer `user` (App.tsx's onboarding gate) must wait on `isLoading` and
 * fail closed on `isError`; inline affordances may keep the optimistic value.
 */
export function useCanCreateAgents(): {
  canCreate: boolean;
  isLoading: boolean;
  isError: boolean;
} {
  const { capabilities, isLoading, isError } = useCapabilities();
  return { canCreate: canCreateAgents(capabilities), isLoading, isError };
}

/**
 * Whether the create-agent affordances show in the active org: the caller
 * may create, and the org is not locked (the gateway refuses a new agent
 * there, owner included). Boot routing keeps reading `useCanCreateAgents`,
 * so a locked org never reroutes anyone into onboarding.
 */
export function useCanAddAgentsHere(): boolean {
  const { canCreate } = useCanCreateAgents();
  const { locked } = useOrgWriteLock();
  return canCreate && !locked;
}
