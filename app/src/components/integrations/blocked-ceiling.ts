/**
 * Role-aware signposting for a policy-BLOCKED app: the deep-link that would fix
 * it for a viewer who can act. Policy is per agent only (the org-wide ceiling was
 * removed as overengineering), so a blocked app is ALWAYS blocked by the agent's
 * own ceiling and the fix is ALWAYS that agent's Permissions drill-in. One pure
 * layer so the who-can-fix decision is unit-tested without React. DOM-free +
 * dependency-free.
 */

/**
 * Resolve the "Enable it in Permissions" action for a blocked app, or
 * `undefined` when the viewer cannot fix that app's ceiling (the member view,
 * which keeps the ask-your-admin copy). The returned thunk performs the deep
 * link into this agent's per-agent Permissions detail. Authority: the agent
 * ceiling is agent-manager-editable AND only reachable by someone who can open
 * the Permissions dashboard (`canManageAgent` folds both), so a plain member and
 * a non-admin manager both fall through to `undefined`.
 */
export type PermissionsFix = (slug: string) => (() => void) | undefined;

export function resolvePermissionsFix(opts: {
  /** The viewer manages this agent AND can open the Permissions dashboard. */
  canManageAgent: boolean;
  /** Deep-link to this agent's Permissions drill-in (agent-ceiling fix). */
  openAgentDetail: () => void;
}): PermissionsFix {
  return () => (opts.canManageAgent ? opts.openAgentDetail : undefined);
}
