/**
 * The agent that owns the OPEN archived mission, held across the refetch that
 * removes the mission from the archived list.
 *
 * The cross-agent Archived view derives the open mission's agent from the list
 * it renders (`items.find(selectedId)` → `agentMap[...]`). Every send inside an
 * archived chat re-activates its mission, so the list refetches WITHOUT it —
 * and from that moment the derivation yields null. The archived → active
 * handoff runs after the send resolves, i.e. potentially after that refetch, so
 * reading the live derivation at fire time can leave it with no agent to focus:
 * the panel then opens under whatever agent happened to be current.
 *
 * Latching fixes the ordering without a race: the agent is remembered while the
 * mission is open (when the derivation still works), and only forgotten when
 * the selection is dropped. The composer path has never had the bug because it
 * captures the agent in its send closure; this gives the panel path the same
 * "captured when armed, not when fired" guarantee.
 *
 * Pure so the rule is unit-tested without a renderer.
 */
export function latchMissionAgent<T>(
  /** What was latched during the previous render. */
  previous: T | null,
  /** The open mission's id, or null when nothing is open. */
  selectedId: string | null,
  /** The agent derived from the CURRENT list, null once it drops the mission. */
  current: T | null,
): T | null {
  // Nothing open: forget, so a later handoff can never focus a stale agent.
  if (selectedId === null) return null;
  return current ?? previous;
}
