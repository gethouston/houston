import { isAgentWarmingRefusal } from "./agent-warming-refusal.ts";
import type { OptimisticFailureCopy } from "./optimistic-core.ts";
import { wasToldUser } from "./user-told-mark.ts";

export interface OptimisticRefusalDeps {
  report: (command: string, err: unknown) => void;
  addToast: (toast: OptimisticFailureCopy & { variant: "error" }) => void;
}

export function createOptimisticRefusal(deps: OptimisticRefusalDeps) {
  return (command: string, err: unknown, copy: OptimisticFailureCopy): void => {
    if (wasToldUser(err) || isAgentWarmingRefusal(err)) return;
    deps.report(command, err);
    deps.addToast({ ...copy, variant: "error" });
  };
}
