import type { BillingChoice } from "@houston/engine-adapter";
import { payerTotals, pickerRows } from "@houston/sdk";
import { type ReactNode, useId } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  OrgRadio,
  PickerProgress,
  useOrgMeta,
  useOrgName,
} from "./free-org-picker-rows";
import { PlanBriefingCta, PlanBriefingQuietButton } from "./plan-briefing-cta";

interface StepProps {
  choice: BillingChoice;
  selected: string;
  onSelect: (slug: string) => void;
  busy: boolean;
  /** Renders the frame's title; the id names an inner span for aria-labelledby. */
  title: (text: string, id: string) => ReactNode;
  onConfirm: () => void;
}

/**
 * An action that names an org ("Keep La Fila free"). Only the name truncates,
 * so the pill stays one line as the pick moves between short and long names,
 * and the button's text, its accessible name, stays whole.
 */
function NamedLabel({
  i18nKey,
  name,
}: {
  i18nKey: "choice.picker.keep" | "choice.payer.use";
  name: string;
}) {
  const { t } = useTranslation("plan");
  return (
    <span className="flex min-w-0 whitespace-pre">
      <Trans
        t={t}
        i18nKey={i18nKey}
        components={{ name: <span className="truncate">{name}</span> }}
      />
    </span>
  );
}

/** The phone sheet seats the actions at the bottom, under the thumb. */
function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-auto flex flex-col md:mt-0">{children}</div>;
}

/** The org that stays free. A payer goes on to a second step. */
export function FreeStep(props: StepProps & { payer: boolean }) {
  const { t } = useTranslation("plan");
  const titleId = useId();
  const orgName = useOrgName();
  const orgMeta = useOrgMeta();
  const rows = pickerRows(props.choice);
  const picked = rows.find((row) => row.org.slug === props.selected)?.org;
  const label = !picked ? (
    t("choice.picker.pickOne")
  ) : props.payer ? (
    t("choice.picker.next")
  ) : (
    <NamedLabel i18nKey="choice.picker.keep" name={orgName(picked)} />
  );
  return (
    <>
      {props.payer && <PickerProgress step={1} />}
      {props.title(t("choice.picker.title"), titleId)}
      <div
        role="radiogroup"
        aria-labelledby={titleId}
        className="plan-briefing-stagger mb-6 flex flex-col gap-2"
      >
        {rows.map(({ org, mostActive }) => (
          <OrgRadio
            key={org.slug}
            group="free-org"
            value={org.slug}
            name={orgName(org)}
            checked={org.slug === props.selected}
            onSelect={props.onSelect}
            tag={mostActive ? t("choice.picker.mostActive") : undefined}
            meta={orgMeta(org)}
          />
        ))}
      </div>
      <Actions>
        <PlanBriefingCta
          label={label}
          disabled={!picked || props.busy}
          onClick={props.onConfirm}
        />
      </Actions>
    </>
  );
}

/**
 * The org a payer's subscription pays for, priced per org. The free pick
 * stays listed where it was, disabled, so the two steps read as one list.
 */
export function PaidStep(
  props: StepProps & { freeSlug: string; onBack: () => void },
) {
  const { t, i18n } = useTranslation("plan");
  const titleId = useId();
  const orgName = useOrgName();
  const rows = pickerRows(props.choice);
  const picked = rows.find(
    (row) => row.org.slug === props.selected && row.org.slug !== props.freeSlug,
  )?.org;
  const totals = picked
    ? payerTotals(props.choice, picked.slug, i18n.language)
    : null;
  return (
    <>
      <PickerProgress step={2} />
      {props.title(t("choice.payer.title"), titleId)}
      <div className="mb-6 flex flex-col gap-4">
        <div
          role="radiogroup"
          aria-labelledby={titleId}
          className="plan-briefing-stagger flex flex-col gap-2"
        >
          {rows.map(({ org }) => {
            const free = org.slug === props.freeSlug;
            const price = payerTotals(props.choice, org.slug, i18n.language);
            return (
              <OrgRadio
                key={org.slug}
                group="paid-org"
                value={org.slug}
                name={orgName(org)}
                checked={!free && org.slug === props.selected}
                disabled={free}
                onSelect={props.onSelect}
                tag={free ? t("choice.payer.free") : undefined}
                meta={
                  free
                    ? t("choice.payer.staysFree")
                    : t("choice.picker.meta", {
                        first: t("choice.picker.members", {
                          count: org.memberCount,
                        }),
                        second: t("choice.payer.each", { price: price?.seat }),
                      })
                }
              />
            );
          })}
        </div>
        {totals && (
          <p className="text-[13px] leading-normal text-ink-muted">
            {totals.graceEndsOn
              ? t("choice.payer.grace", {
                  today: totals.today,
                  date: totals.graceEndsOn,
                  monthly: totals.monthly,
                })
              : t("choice.payer.noGrace", { monthly: totals.monthly })}
          </p>
        )}
      </div>
      <Actions>
        <PlanBriefingCta
          label={
            picked ? (
              <NamedLabel i18nKey="choice.payer.use" name={orgName(picked)} />
            ) : (
              t("choice.picker.pickOne")
            )
          }
          disabled={!picked || props.busy}
          onClick={props.onConfirm}
        />
        <PlanBriefingQuietButton onClick={props.onBack} disabled={props.busy}>
          {t("choice.payer.back")}
        </PlanBriefingQuietButton>
      </Actions>
    </>
  );
}
