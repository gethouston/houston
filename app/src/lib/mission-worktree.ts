import { tauriConfig, tauriShell, tauriWorktree } from "./tauri";

export async function createMissionWorktreeIfEnabled(
  agentPath: string,
): Promise<string | undefined> {
  const cfg = await tauriConfig.read(agentPath);
  if (!cfg.worktreeMode) return undefined;

  const slug = crypto.randomUUID().slice(0, 8);
  const worktree = await tauriWorktree.create(agentPath, slug);
  const installCmd =
    typeof cfg.installCommand === "string" && cfg.installCommand.trim().length > 0
      ? cfg.installCommand
      : undefined;
  if (installCmd) await tauriShell.run(worktree.path, installCmd);
  return worktree.path;
}
