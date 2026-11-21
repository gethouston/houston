import { isPlanMinIntervalRefusal } from "@houston/sdk/routines/plan-floor-quiet";
import { isAgentWarmingRefusal } from "./agent-warming-refusal.ts";
import { wasToldUser } from "./user-told-mark.ts";

export interface RoutineWriteFailureDeps {
  addToast: (toast: {
    title: string;
    description: string;
    variant: "error";
  }) => void;
  describe: (command: string, err: unknown) => string;
}

export function toastRoutineWriteFailure(
  err: unknown,
  failure: { title: string; command: string },
  deps: RoutineWriteFailureDeps,
): void {
  if (
    isPlanMinIntervalRefusal(err) ||
    wasToldUser(err) ||
    isAgentWarmingRefusal(err)
  )
    return;
  deps.addToast({
    title: failure.title,
    description: deps.describe(failure.command, err),
    variant: "error",
  });
}
