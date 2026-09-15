/**
 * The `rest` the per-agent family handlers take: everything after
 * `/agents/<id>/`, exactly as routes/agents.ts's dispatch regex captured it.
 *
 * RAW on purpose. The handlers decode the segments they own (a skill slug, a
 * conversation id) and the runtime channel forwards the rest byte for byte, so
 * decoding here would change what an agent receives. Derived from the path
 * rather than from a matched `*rest` capture because a family matches on
 * several patterns — its members, then the boundary it owns — and only the
 * path is the same string for all of them.
 */
export const agentRest = (path: string): string =>
  path.split("/").slice(3).join("/");
