import type { OrgRole } from "@houston/engine-adapter";
import { type SeatQuote, seatAddStep } from "@houston/sdk";
import { useRef, useState } from "react";
import { useAddMember, useSeatQuote } from "../../hooks/queries";
import { useActiveOrgBilling } from "../../hooks/queries/use-billing";
import { useOrgWriteLock } from "../../hooks/use-org-write-lock";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { afterAdd, type ChargeDialog, chargeDialog } from "./people-seat-flow";
import type { AddOutcome } from "./people-tab-model";

/**
 * The add-someone flow with a seat that may cost money. Add re-reads the
 * quote, then adds straight away, opens the charge dialog, or does nothing
 * while only the payer can add a seat. Unexpected failures (the quote, the
 * add) already surfaced and reported through `call()`; the seat refusals come
 * back as outcomes and land in the dialog. A locked org takes no one new, so
 * it is never quoted. One add runs at a time, whatever starts it.
 */
export function useSeatAdd(onDone: (outcome: AddOutcome) => void) {
  const { billing, isLoading } = useActiveOrgBilling();
  const { locked } = useOrgWriteLock();
  const quote = useSeatQuote(!isLoading && !locked);
  const addMember = useAddMember();
  const [dialog, setDialog] = useState<ChargeDialog | null>(null);
  const busy = useRef(false);
  const purchasable = canPurchaseInApp();

  const send = async (
    email: string,
    role: OrgRole,
    sentUnder: SeatQuote,
    current: ChargeDialog | null,
  ): Promise<void> => {
    let outcome: Awaited<ReturnType<typeof addMember.mutateAsync>>;
    try {
      outcome = await addMember.mutateAsync({
        email,
        role,
        charge:
          sentUnder.kind === "charge"
            ? {
                prorationDate: sentUnder.prorationDate,
                quotedAmountCents: sentUnder.amountCents,
              }
            : undefined,
      });
    } catch {
      // `call()` already surfaced and reported it; the dialog asks again.
      if (current) setDialog({ ...current, phase: "ask" });
      return;
    }
    const next = afterAdd({
      email,
      role,
      quote: sentUnder,
      billing,
      outcome,
      dialog: current,
      purchasable,
    });
    if (next.kind === "dialog") return setDialog(next.dialog);
    // Once, with no dialog: a second change closes rather than loops.
    if (next.kind === "resend") return send(email, role, next.quote, null);
    setDialog(null);
    if (next.kind === "done") onDone(next.outcome);
  };

  const guarded = async (run: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await run();
    } finally {
      busy.current = false;
    }
  };

  const start = (email: string, role: OrgRole) =>
    guarded(async () => {
      let fresh: SeatQuote | undefined;
      try {
        fresh = (await quote.refetch({ throwOnError: true })).data;
      } catch {
        // `call()` already surfaced and reported it; nothing is added unpriced.
        return;
      }
      if (!fresh) return;
      const step = seatAddStep(fresh);
      if (step.kind === "ask_payer") return;
      // The store apps never show a price, so they never take a charge.
      if (step.kind === "confirm_charge") {
        if (purchasable) setDialog(chargeDialog(email, role, step.quote));
        return;
      }
      await send(email, role, fresh, null);
    });

  const pay = () => {
    if (!dialog || dialog.phase === "paying") return;
    const paying: ChargeDialog = { ...dialog, phase: "paying" };
    void guarded(async () => {
      setDialog(paying);
      await send(dialog.email, dialog.role, dialog.quote, paying);
    });
  };

  return {
    billing,
    quote: quote.data,
    purchasable,
    dialog,
    start,
    pay,
    cancel: () => setDialog(null),
    portalOpened: () =>
      setDialog((open) => (open ? { ...open, portalOpened: true } : open)),
    pending: addMember.isPending,
  };
}
