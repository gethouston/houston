import { type PlusCheckoutRefusal, plusCheckoutRefusal } from "@houston/sdk";

/** The authored copy for each expected checkout refusal, as `plan` keys. */
const REFUSAL_COPY = {
  already_plus: {
    title: "plan:checkoutAlreadyPlusTitle",
    body: "plan:checkoutAlreadyPlusBody",
  },
  account_deleted: {
    title: "plan:checkoutAccountDeletedTitle",
    body: "plan:checkoutAccountDeletedBody",
  },
  not_configured: {
    title: "plan:checkoutUnavailableTitle",
    body: "plan:checkoutUnavailableBody",
  },
} as const satisfies Record<PlusCheckoutRefusal, unknown>;

export type PlusCheckoutCopyKey = (typeof REFUSAL_COPY)[PlusCheckoutRefusal][
  | "title"
  | "body"];

export interface PlusCheckoutFailureSurface {
  /** Refetch the plan: an `already_plus` refusal means the cached one is stale. */
  invalidatePlan(): void;
  /** One informational toast with authored copy, never the bug pair. */
  showExpected(title: PlusCheckoutCopyKey, body: PlusCheckoutCopyKey): void;
  /** Log and report an unexpected failure; dedupes what `call()` captured. */
  report(error: unknown): void;
}

/**
 * The one surface of a Plus checkout that could not start. The C19 refusals
 * are states the person is in (already Plus, account being deleted, plan off),
 * so they read as plain guidance with no report; the engine-call layer
 * silences them for exactly that reason. Anything else is a bug, reported once.
 */
export function surfacePlusCheckoutFailure(
  error: unknown,
  surface: PlusCheckoutFailureSurface,
): void {
  const refusal = plusCheckoutRefusal(error);
  if (refusal === null) {
    surface.report(error);
    return;
  }
  if (refusal === "already_plus") surface.invalidatePlan();
  const copy = REFUSAL_COPY[refusal];
  surface.showExpected(copy.title, copy.body);
}
