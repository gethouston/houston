/**
 * The install press of "From a friend" as an ORDER of steps, with no React in
 * it: refuse an unusable name, run the round-trip, then reveal the agent.
 * `use-import-install-action.ts` supplies the effects and wraps this in the
 * same-tick latch.
 *
 * Kept apart from the hook so the press is drivable in a plain test — a rage
 * burst making exactly ONE round-trip is the behaviour that matters here, and
 * a React-free action is what lets a test prove it.
 */

import type { PortableInstalledAgent } from "@houston/engine-adapter";
import type { KickoffPin } from "../../lib/kickoff-pin";
import type { InstallImportedAgentArgs } from "./import-install-request";

export interface ImportInstallRun {
  /** What to install, or null while the sheet has no package or workspace. */
  args: InstallImportedAgentArgs | null;
  /** Authored copy for whatever makes the typed name unusable, or null. */
  nameProblem: () => string | null;
  /** The provider/model the user confirmed, read at press time. */
  resolveKickoffPin: () => KickoffPin;
  /** The engine round-trip. */
  install: (
    args: InstallImportedAgentArgs,
    kickoffPin: KickoffPin,
  ) => Promise<PortableInstalledAgent>;
  /** The agent is the user's now: show it, say so, and dismiss the sheet. */
  reveal: (installed: PortableInstalledAgent) => void;
  /** The typed name cannot be used; nothing was sent. */
  reportNameProblem: (problem: string) => void;
  /** The round-trip failed; the sheet stays so the user can try again. */
  reportFailure: (err: unknown) => void;
  /** The press is in flight — the button's pending label. */
  setInstalling: (installing: boolean) => void;
}

export async function runImportInstall(run: ImportInstallRun): Promise<void> {
  if (!run.args) return;
  const problem = run.nameProblem();
  if (problem) {
    run.reportNameProblem(problem);
    return;
  }
  const kickoffPin = run.resolveKickoffPin();
  run.setInstalling(true);
  try {
    const installed = await run.install(run.args, kickoffPin);
    run.reveal(installed);
  } catch (err) {
    run.reportFailure(err);
  } finally {
    run.setInstalling(false);
  }
}
