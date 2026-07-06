/**
 * First-run agent creation must return as soon as the agent RECORD exists and
 * refresh the stores in the BACKGROUND — it must never block on that refresh.
 *
 * Right after `POST /agents` the app already holds the agent record, which is
 * all the next onboarding step (connect your email) needs. The store refresh,
 * by contrast, reads providers/agents through the NEW agent's runtime — a pod
 * still cold-starting on the hosted profile (HOU-649). Awaiting it stalled the
 * "create" click ~20s while the pod warmed. Surfacing the agent first lets
 * onboarding advance immediately; the pod finishes warming while the user
 * connects their inbox, so their first message lands on an already-ready pod.
 *
 * Pure + dependency-injected so the "don't block on the refresh" contract is
 * unit-tested without the React / store / tauri graph.
 */
export async function surfaceAgentThenRefresh<A>(
  create: () => Promise<A>,
  surface: (agent: A) => void,
  refresh: (agent: A) => Promise<void>,
  onRefreshError: (err: unknown) => void,
): Promise<A> {
  const agent = await create();
  // Release the UI on the record alone — the caller may now advance the flow.
  surface(agent);
  // Fire-and-forget: refresh() dispatches reads to the agent's cold pod, so
  // awaiting here would reintroduce the ~20s stall this function exists to
  // remove. A failure is logged; the stores self-heal on their next load.
  void refresh(agent).catch(onRefreshError);
  return agent;
}
