import { formatPlanAmount } from "@houston/sdk";
import { FormDialog, Input } from "@houston-ai/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrgCheckout } from "../../hooks/queries/use-org-checkout";
import { createdOrg, useCreateTeam } from "../../hooks/queries/use-orgs";
import { useOrgs } from "../../hooks/queries/use-spaces";
import { stayOpen } from "../../lib/dialog-stay-open";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { BILLING_CURRENCY } from "../organization/billing-tab-model";
import { type PaidOrgOffer, paidOrgOffer } from "./create-org-offer";
import { MAX_TEAM_NAME_LENGTH, validateTeamName } from "./create-team-model";
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
 * switches into it (locked until the payment goes through). The store apps
 * never sell, so there the dialog only says the free slot is taken.
 */
export function CreateOrganizationDialog({ open, onOpenChange }: Props) {
  const { t, i18n } = useTranslation(["teams", "common", "plan"]);
  const createOrganization = useCreateTeam();
  const orgs = useOrgs(open);
  const checkout = useOrgCheckout();
  const land = useLandInCreatedOrg();
  const [name, setName] = useState("");
  const [offer, setOffer] = useState<PaidOrgOffer | null>(null);
  const purchasable = canPurchaseInApp();

  // Start every open with a clean field; reset on close so a reopen after a
  // successful create (or a cancel) never shows the last value.
  useEffect(() => {
    if (open) return;
    setName("");
    setOffer(null);
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
      setOffer(paidOrgOffer(validation.name, outcome.freeOrgSlug, orgs.data));
      return false;
    }
    await land(outcome.org, null);
  };

  const submitPaid = async () => {
    if (!offer) return stayOpen();
    // Claimed now, while the click's activation is live: the checkout URL
    // only arrives with the create's answer.
    const tab = checkout.reserveTab();
    const outcome = await createOrganization
      .mutateAsync({ name: offer.name, plan: "paid" })
      .catch(() => {
        tab?.discard();
        return stayOpen();
      });
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
    const freeOrg =
      offer.freeOrg?.kind === "personal"
        ? t("plan:choice.picker.personal")
        : offer.freeOrg?.name;
    const price =
      offer.seatPriceCents === null
        ? null
        : formatPlanAmount(
            offer.seatPriceCents,
            BILLING_CURRENCY,
            i18n.language,
          );
    return (
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={
          purchasable
            ? t("teams:createTeam.paidTitle", { name: offer.name })
            : t("teams:native.freeTakenTitle")
        }
        description={
          freeOrg
            ? t("teams:createTeam.freeTaken", { freeOrg })
            : t("teams:createTeam.freeTakenUnknown")
        }
        primary={
          purchasable
            ? {
                label: t("teams:createTeam.paidSubmit"),
                pendingLabel: t("teams:createTeam.creating"),
                onClick: submitPaid,
                disabled: checkout.outstanding,
              }
            : { label: t("common:actions.close") }
        }
        secondary={purchasable ? undefined : null}
        labels={{ cancel: t("common:actions.cancel") }}
      >
        <p className="text-sm text-ink-muted" data-testid="paid-org-offer">
          {!purchasable
            ? t("teams:native.freeTakenBody")
            : price
              ? t("teams:createTeam.paidPrice", { name: offer.name, price })
              : t("teams:createTeam.paidPriceUnknown", { name: offer.name })}
        </p>
      </FormDialog>
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
