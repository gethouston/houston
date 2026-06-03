import {
  tauriConfig,
  tauriPreferences,
  tauriShell,
  tauriTerminal,
  tauriWorktree,
} from "./tauri";

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

export async function openMissionWorktreeTerminal(
  agentPath: string,
  worktreePath: string,
): Promise<void> {
  const cfg = await tauriConfig.read(agentPath);
  const devCmd = typeof cfg.devCommand === "string" ? cfg.devCommand : undefined;
  const terminal = (await tauriPreferences.get("terminal")) ?? undefined;
  await tauriTerminal.open(worktreePath, devCmd, terminal);
}
