import type { Vfs } from "../vfs";

/**
 * Reader for the Rust-era per-agent color (`<agentRoot>/.houston/agent.json`).
 *
 * The deleted Rust engine persisted each agent's picked color server-side, in
 * `AgentMeta.color` inside `agent.json` (see the historical
 * `engine/houston-engine-core/src/agents_crud.rs`). The v3 host's own agent
 * model is deliberately id/name only — color became a client-side cosmetic
 * overlay — so after the engine cutover nothing read this file and every
 * upgraded agent silently fell back to the client's default purple.
 *
 * The host serves this value as a read-only legacy passthrough on agent
 * payloads (GET /agents, the rename response, the migration source scan). The
 * client's own overlay — the user's current pick — always outranks it, and the
 * host never writes the file, so the read is idempotent by construction:
 * already-migrated users get their colors back on the next agent list.
 */
export async function legacyAgentColor(
  vfs: Vfs,
  agentRoot: string,
): Promise<string | undefined> {
  const raw = await vfs.readText(`${agentRoot}/.houston/agent.json`);
  if (raw === null) return undefined; // no Rust-era metadata — nothing to serve
  try {
    const meta = JSON.parse(raw) as { color?: unknown };
    return typeof meta.color === "string" && meta.color
      ? meta.color
      : undefined;
  } catch {
    // A hand-edited/corrupt legacy file must not fail the whole agent list
    // over a cosmetic — the agent just renders the client default. Logged so
    // the breadcrumb reaches the app logs, never thrown.
    console.warn(
      `[agents] unreadable legacy agent.json under ${agentRoot} — ignoring its color`,
    );
    return undefined;
  }
}
