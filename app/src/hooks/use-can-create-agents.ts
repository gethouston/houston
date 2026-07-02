import { canCreateAgents } from "../lib/org-roles";
import { useCapabilities } from "./use-capabilities";

/**
 * Whether the current user may create agents. Single-player builds and
 * owner/admin get `true`; a plain org `user` gets `false`, so every
 * create-agent affordance (sidebar add, empty-state CTAs, onboarding) hides.
 * The gateway rejects `POST /agents` from a `user` regardless — this only keeps
 * the UI honest.
 */
export function useCanCreateAgents(): boolean {
  const { capabilities } = useCapabilities();
  return canCreateAgents(capabilities);
}
