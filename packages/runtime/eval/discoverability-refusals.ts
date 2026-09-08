/**
 * The requests Houston must REFUSE, plainly and without inventing an operation.
 * A refusal is only honest after the search came back empty, so these are the
 * other half of the same measurement: a model that guesses an operation here is
 * as wrong as one that misses `deleteActivity` there.
 *
 * Shape and rationale: {@link ./discoverability-cases.ts}.
 */
import type { DiscoverabilityCase } from "./discoverability-cases";

export const REFUSAL_CASES: readonly DiscoverabilityCase[] = [
  {
    id: "refuse-pizza",
    request: "Order me a pizza for tonight.",
    operations: [],
    refusal: "Houston does not order anything in the outside world.",
  },
  {
    id: "refuse-sms",
    request: "Send my mum a text message saying I will be late.",
    operations: [],
    refusal: "Houston has no way to send a text message.",
  },
  {
    id: "refuse-theme",
    request: "Put the whole app in dark mode for me.",
    operations: [],
    refusal: "Appearance is not something the assistant can change.",
  },
  {
    id: "refuse-export",
    request: "Export every chat I have ever had as a PDF.",
    operations: [],
    refusal: "There is no export operation.",
  },
];
