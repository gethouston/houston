import type { PortableInstalledAgent } from "@houston/engine-adapter";
import { isAgentNameTaken } from "@houston/sdk";
import type { KickoffPin } from "../../lib/kickoff-pin";
import type { InstallImportedAgentArgs } from "./import-install-request";

export interface ImportInstallRun {
  args: InstallImportedAgentArgs | null;
  nameProblem: () => string | null;
  resolveKickoffPin: () => KickoffPin;
  install: (
    args: InstallImportedAgentArgs,
    kickoffPin: KickoffPin,
  ) => Promise<PortableInstalledAgent>;
  reveal: (installed: PortableInstalledAgent) => void;
  reportNameProblem: (problem: string) => void;
  reportNameTaken: () => void;
  reportFailure: (err: unknown) => void;
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
    if (isAgentNameTaken(err)) run.reportNameTaken();
    else run.reportFailure(err);
  } finally {
    run.setInstalling(false);
  }
}
