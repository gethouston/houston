import type { BillingChoice } from "@houston/engine-adapter";
import { type FlowProgress, pickerRows } from "@houston/sdk";
import { type ReactNode, useId } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  OrgRadio,
  PickerProgress,
  useOrgMeta,
  useOrgName,
  usePayerMeta,
} from "./free-org-picker-rows";
import { PlanBriefingCta, PlanBriefingQuietButton } from "./plan-briefing-cta";

interface StepProps {
  choice: BillingChoice;
  selected: string;
  onSelect: (slug: string) => void;
  busy: boolean;
  /** Renders the frame's title; the id names an inner span for aria-labelledby. */
  title: (text: string, id: string) => ReactNode;
  progress: FlowProgress | null;
  onConfirm: () => void;
  /** Absent on the first page of a flow. */
  onBack?: () => void;
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
function Actions({
  label,
  disabled,
  onConfirm,
  onBack,
  busy,
}: {
  label: ReactNode;
  disabled: boolean;
  onConfirm: () => void;
  onBack?: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation("plan");
  return (
    <div className="mt-auto flex flex-col md:mt-0">
      <PlanBriefingCta label={label} disabled={disabled} onClick={onConfirm} />
      {onBack && (
        <PlanBriefingQuietButton onClick={onBack} disabled={busy}>
          {t("choice.notice.back")}
        </PlanBriefingQuietButton>
      )}
    </div>
  );
}

/**
 * The org that stays free, for everyone in it. A payer's subscription org
 * stays listed where it is, disabled, so the two steps read as one list.
 */
export function FreeStep(props: StepProps & { paidSlug: string | null }) {
  const { t } = useTranslation("plan");
  const titleId = useId();
  const orgName = useOrgName();
  const orgMeta = useOrgMeta();
  const rows = pickerRows(props.choice);
  const picked = rows.find(
    (row) => row.org.slug === props.selected && row.org.slug !== props.paidSlug,
  )?.org;
  return (
    <>
      <PickerProgress progress={props.progress} />
      {props.title(t("choice.picker.title"), titleId)}
      <p className="mb-5 text-base leading-normal text-ink-muted">
        {t("choice.picker.sub")}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={titleId}
        className="plan-briefing-stagger mb-6 flex flex-col gap-2"
      >
        {rows.map(({ org, mostActive }) => {
          const paid = org.slug === props.paidSlug;
          return (
            <OrgRadio
              key={org.slug}
              group="free-org"
              value={org.slug}
              name={orgName(org)}
              checked={!paid && org.slug === props.selected}
              disabled={paid}
              onSelect={props.onSelect}
              tag={
                paid
                  ? t("choice.done.status.subscription")
                  : mostActive
                    ? t("choice.picker.mostActive")
                    : undefined
              }
              meta={orgMeta(org)}
            />
          );
        })}
      </div>
      <Actions
        label={
          picked ? (
            <NamedLabel i18nKey="choice.picker.keep" name={orgName(picked)} />
          ) : (
            t("choice.picker.pickOne")
          )
        }
        disabled={!picked || props.busy}
        onConfirm={props.onConfirm}
        onBack={props.onBack}
        busy={props.busy}
      />
    </>
  );
}

/** The org a payer's subscription covers, priced per member. Comes first. */
export function PaidStep(props: StepProps) {
  const { t } = useTranslation("plan");
  const titleId = useId();
  const orgName = useOrgName();
  const rows = pickerRows(props.choice);
  const picked = rows.find((row) => row.org.slug === props.selected)?.org;
  const payerMeta = usePayerMeta(props.choice);
  return (
    <>
      <PickerProgress progress={props.progress} />
      <p className="mb-2 text-sm font-medium text-ink-muted">
        {t("choice.payer.label")}
      </p>
      {props.title(t("choice.payer.title"), titleId)}
      <div
        role="radiogroup"
        aria-labelledby={titleId}
        className="plan-briefing-stagger mt-3 mb-6 flex flex-col gap-2"
      >
        {rows.map(({ org, mostActive }) => (
          <OrgRadio
            key={org.slug}
            group="paid-org"
            value={org.slug}
            name={orgName(org)}
            checked={org.slug === props.selected}
            onSelect={props.onSelect}
            tag={mostActive ? t("choice.picker.mostActive") : undefined}
            meta={payerMeta(org)}
          />
        ))}
      </div>
      <Actions
        label={
          picked ? (
            <NamedLabel i18nKey="choice.payer.use" name={orgName(picked)} />
          ) : (
            t("choice.picker.pickOne")
          )
        }
        disabled={!picked || props.busy}
        onConfirm={props.onConfirm}
        onBack={props.onBack}
        busy={props.busy}
      />
    </>
  );
}
