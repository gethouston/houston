import type { Vfs } from "../vfs";

export async function legacyAgentColor(
  vfs: Vfs,
  agentRoot: string,
): Promise<string | undefined> {
  const raw = await vfs.readText(`${agentRoot}/.houston/agent.json`);
  if (raw === null) return undefined;
  try {
    const meta = JSON.parse(raw) as { color?: unknown };
    return typeof meta.color === "string" && meta.color
      ? meta.color
      : undefined;
  } catch {
    console.warn(
      `[agents] unreadable legacy agent.json under ${agentRoot} — ignoring its color`,
    );
    return undefined;
  }
}
