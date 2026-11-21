import { OPERATION_CASES } from "./discoverability-operations";
import { REFUSAL_CASES } from "./discoverability-refusals";

export interface DiscoverabilityCase {
  id: string;
  request: string;
  operations: readonly string[];
  refusal?: string;
}

export const DISCOVERABILITY_CASES: readonly DiscoverabilityCase[] = [
  ...OPERATION_CASES,
  ...REFUSAL_CASES,
];
