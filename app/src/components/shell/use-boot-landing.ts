import { useLayoutEffect, useState } from "react";
import {
  type BootGuardInput,
  type BootLanding,
  bootGuardStep,
  INITIAL_BOOT_GUARD,
} from "./view-guard-rules.ts";

export function useBootLanding(
  input: BootGuardInput,
  openAgent: (agentId: string) => void,
): BootLanding {
  const [boot, setBoot] = useState(INITIAL_BOOT_GUARD);
  const step = bootGuardStep(boot, input);
  useLayoutEffect(() => {
    if (boot === step.state) return;
    setBoot(step.state);
    if (step.action.kind === "open-agent") openAgent(step.action.agentId);
  });
  return step.landing;
}
