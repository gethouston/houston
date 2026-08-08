/**
 * The per-agent Files wiring, mounted by the team view's Files section.
 * `AgentFilesSurface` is the surface; `useAgentFiles` is the wiring behind it
 * (see that file for why it is one module and how it keeps the read on a
 * single cache entry).
 */
export { AgentFilesSurface } from "./agent-files-surface";
export type { AgentFiles } from "./use-agent-files";
export { useAgentFiles } from "./use-agent-files";
