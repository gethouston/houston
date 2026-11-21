import { isAgentWarmingRefusal } from "./agent-warming-refusal";
import { wasToldUser } from "./user-told-mark";

export function throwFirstRefusal(
  settled: readonly PromiseSettledResult<unknown>[],
): void {
  const reasons = settled.flatMap((r) =>
    r.status === "rejected" ? [r.reason as unknown] : [],
  );
  if (reasons.length === 0) return;
  const explained = (err: unknown) =>
    wasToldUser(err) || isAgentWarmingRefusal(err);
  throw reasons.find((err) => !explained(err)) ?? reasons[0];
}
