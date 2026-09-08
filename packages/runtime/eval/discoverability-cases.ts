import { OPERATION_CASES } from "./discoverability-operations";
import { REFUSAL_CASES } from "./discoverability-refusals";

/**
 * THE DISCOVERABILITY FIXTURES: what a person asks Houston for, and the Houston
 * operation that answers it.
 *
 * Written after a live failure no unit test could catch: asked to delete a
 * mission, Houston answered that missions cannot be deleted while
 * `deleteActivity` sat in the catalog, visible and callable. Nothing was broken
 * - the model answered from memory instead of looking. So what is under test is
 * FINDING, not dispatching. Read by the static half (`discoverability.test.ts`,
 * CI) and the model half (`run-discoverability.ts`, opt-in).
 *
 * `operations` lists every answer that counts as right: several requests have
 * more than one honest reading, and insisting on one of them would measure the
 * fixture's taste rather than the assistant's reach.
 */
export interface DiscoverabilityCase {
  /** Stable id, so a regression can be named in a report. */
  id: string;
  /** What the user says, in their own words. */
  request: string;
  /** The operations that answer it. Empty when Houston cannot do this at all. */
  operations: readonly string[];
  /** Why nothing answers it, for the cases Houston must refuse. */
  refusal?: string;
}

/** Every case, in one list: what must be found, then what must be refused. */
export const DISCOVERABILITY_CASES: readonly DiscoverabilityCase[] = [
  ...OPERATION_CASES,
  ...REFUSAL_CASES,
];
