import type { OrgRole } from "@houston/engine-adapter";
import { type SeatQuote, seatAddStep } from "@houston/sdk";
import { useState } from "react";
import { useAddMember, useSeatQuote } from "../../hooks/queries";
import { useActiveOrgBilling } from "../../hooks/queries/use-billing";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import {
  afterAdd,
  type ChargeDialog,
  chargeDialog,
  type SeatFlowNext,
} from "./people-seat-flow";
import type { AddOutcome } from "./people-tab-model";

/**
 * The add-someone flow with a seat that may cost money. Add re-reads the
 * quote, then adds straight away, opens the charge dialog, or does nothing
 * while only the payer can add a seat. Unexpected failures (the quote, the
 * add) already surfaced and reported through `call()`; the seat refusals come
 * back as outcomes and land in the dialog.
 */
export function useSeatAdd(onDone: (outcome: AddOutcome) => void) {
  const { billing } = useActiveOrgBilling();
  const quote = useSeatQuote(true);
  const addMember = useAddMember();
  const [dialog, setDialog] = useState<ChargeDialog | null>(null);
  const purchasable = canPurchaseInApp();

  const apply = (next: SeatFlowNext) => {
    if (next.kind === "dialog") return setDialog(next.dialog);
    setDialog(null);
    if (next.kind === "done") onDone(next.outcome);
  };

  const send = async (
    email: string,
    role: OrgRole,
    sentUnder: SeatQuote,
    current: ChargeDialog | null,
  ) => {
    try {
      const outcome = await addMember.mutateAsync({
        email,
        role,
        prorationDate:
          sentUnder.kind === "charge" ? sentUnder.prorationDate : undefined,
      });
      apply(
        afterAdd({
          email,
          role,
          quote: sentUnder,
          billing,
          outcome,
          dialog: current,
        }),
      );
    } catch {
      // `call()` already surfaced and reported it; the dialog asks again.
      if (current) setDialog({ ...current, phase: "ask" });
    }
  };

  const start = async (email: string, role: OrgRole) => {
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
  };

  const pay = () => {
    if (!dialog || dialog.phase === "paying") return;
    const paying: ChargeDialog = { ...dialog, phase: "paying" };
    setDialog(paying);
    void send(dialog.email, dialog.role, dialog.quote, paying);
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
