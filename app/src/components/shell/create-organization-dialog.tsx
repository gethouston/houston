import type {
  BillingInterval,
  SeatIntervalRefusal,
} from "@houston/engine-adapter";
import { FormDialog, Input } from "@houston-ai/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrgCheckout } from "../../hooks/queries/use-org-checkout";
import { createdOrg, useCreateTeam } from "../../hooks/queries/use-orgs";
import { useOrgs } from "../../hooks/queries/use-spaces";
import { useSeatRefusalToast } from "../../hooks/use-seat-refusal-toast";
import { stayOpen } from "../../lib/dialog-stay-open";
import { paidOrgOffer } from "./create-org-offer";
import { MAX_TEAM_NAME_LENGTH, validateTeamName } from "./create-team-model";
import { PaidOrgOfferDialog } from "./paid-org-offer-dialog";
import { useLandInCreatedOrg } from "./use-land-in-created-org";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create an ORGANIZATION (`POST /v1/orgs`). Only rendered on a hosted
 * deployment that advertises `capabilities.spaces`; the desktop / self-host
 * create action stays the local-workspace dialog.
 *
 * A create is free first. Each person owns one free org, so while that slot
 * is taken the gateway creates nothing and the dialog turns into an offer:
 * create the org as a paid one and open its checkout, after which the app
 * switches into it (locked until the payment goes through). The offer itself
 * (monthly or yearly, the store apps' "slot taken") is `PaidOrgOfferDialog`.
 */
export function CreateOrganizationDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation(["teams", "common"]);
  const createOrganization = useCreateTeam();
  const orgs = useOrgs(open);
  const checkout = useOrgCheckout();
  const land = useLandInCreatedOrg();
  const announceRefusal = useSeatRefusalToast();
  const [name, setName] = useState("");
  // The free slot taken: what to offer as paid. Its prices are read off the
  // live orgs list on every render (`paidOrgOffer`).
  const [taken, setTaken] = useState<{
    name: string;
    freeOrgSlug: string;
  } | null>(null);
  const offer = taken
    ? paidOrgOffer(taken.name, taken.freeOrgSlug, orgs.data)
    : null;

  // Start every open with a clean field; reset on close so a reopen after a
  // successful create (or a cancel) never shows the last value.
  useEffect(() => {
    if (open) return;
    setName("");
    setTaken(null);
  }, [open]);

  const validation = validateTeamName(name);
  const showTooLong = !validation.ok && validation.reason === "too_long";

  // Resolving is what closes the dialog: the recipe owns the close, so an
  // empty or over-long name is refused by `disabled` alone. A failed create
  // was already surfaced by the engine call (`call()`), so its rejection
  // becomes `stayOpen()`: the form stays up with the name intact and nothing
  // is filed a second time. `POST /v1/orgs` is not idempotent, so a retry is
  // the person's, never a blind one here.
  const submit = async () => {
    if (!validation.ok) return stayOpen();
    const outcome = await createOrganization
      .mutateAsync({ name: validation.name })
      .catch(() => stayOpen());
    if (outcome.kind === "free_org_taken") {
      // Nothing was created and nothing failed: the dialog stays to offer
      // the paid create.
      setTaken({ name: validation.name, freeOrgSlug: outcome.freeOrgSlug });
      return false;
    }
    const org = createdOrg(outcome);
    if (!org) return stayOpen();
    await land(org, null);
  };

  // Resolves with the refused interval (nothing was created; the orgs list
  // refetches and the person is told), so the offer stays up on monthly.
  const submitPaid = async (
    interval: BillingInterval,
  ): Promise<SeatIntervalRefusal | undefined> => {
    if (!offer) return stayOpen();
    // Claimed now, while the click's activation is live: the checkout URL
    // only arrives with the create's answer.
    const tab = checkout.reserveTab();
    const outcome = await createOrganization
      .mutateAsync({ name: offer.name, plan: "paid", interval })
      .catch(() => {
        tab?.discard();
        return stayOpen();
      });
    if (
      outcome.kind === "interval_unavailable" ||
      outcome.kind === "invalid_interval"
    ) {
      tab?.discard();
      announceRefusal();
      return outcome.kind;
    }
    const org = createdOrg(outcome);
    if (outcome.kind !== "checkout") {
      tab?.discard();
      if (!org) return stayOpen();
      await land(org, null);
      return;
    }
    const fallbackUrl = await checkout.resume(
      outcome.org.slug,
      outcome.checkoutUrl,
      tab,
    );
    await land(outcome.org, { fallbackUrl });
  };

  if (offer) {
    return (
      <PaidOrgOfferDialog
        open={open}
        onOpenChange={onOpenChange}
        offer={offer}
        outstanding={checkout.outstanding}
        pending={createOrganization.isPending}
        onSubmit={submitPaid}
      />
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("teams:createTeam.title")}
      description={t("teams:createTeam.description")}
      primary={{
        label: t("teams:createTeam.submit"),
        pendingLabel: t("teams:createTeam.creating"),
        onClick: submit,
        disabled: !validation.ok,
      }}
      labels={{ cancel: t("common:actions.cancel") }}
    >
      <div>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("teams:createTeam.namePlaceholder")}
          aria-label={t("teams:createTeam.nameLabel")}
          aria-invalid={showTooLong}
          disabled={createOrganization.isPending}
        />
        {showTooLong ? (
          <p className="mt-2 text-sm text-danger">
            {t("teams:createTeam.tooLong", { max: MAX_TEAM_NAME_LENGTH })}
          </p>
        ) : null}
      </div>
    </FormDialog>
  );
}
