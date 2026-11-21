import { useUIStore } from "../stores/ui";
import { logAndReportError } from "./error-report";
import { type OptimisticWrite, runOptimisticWrite } from "./optimistic-core";
import { createOptimisticRefusal } from "./optimistic-refusal";

export type {
  OptimisticFailureCopy,
  OptimisticPatch,
  OptimisticWrite,
} from "./optimistic-core";

export const tellOptimisticRefusal = createOptimisticRefusal({
  report: logAndReportError,
  addToast: (toast) => useUIStore.getState().addToast(toast),
});

export function optimisticWrite<T>(opts: OptimisticWrite<T>): Promise<void> {
  return runOptimisticWrite(opts, tellOptimisticRefusal, logAndReportError);
}
