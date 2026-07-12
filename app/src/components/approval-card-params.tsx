import { Fragment } from "react";
import { useTranslation } from "react-i18next";

/**
 * The approval card's param block: the tool's settings as a two-column list
 * (muted key, foreground value), plus a muted "+N more" line when the host
 * capped the rows. The approval covers ALL params — the hash gates on every one
 * — so the count tells the user they're allowing more than the visible rows.
 * Renders nothing when there are no rows and none were omitted.
 */
export function ApprovalCardParams({
  params,
  paramsOmitted,
}: {
  params?: Record<string, string>;
  paramsOmitted?: number;
}) {
  const { t } = useTranslation("chat");
  const rows = params ? Object.entries(params) : [];
  const omitted = paramsOmitted ?? 0;
  if (rows.length === 0 && omitted <= 0) return null;
  return (
    <>
      {rows.length > 0 && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          {rows.map(([key, value]) => (
            <Fragment key={key}>
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="min-w-0 break-words text-foreground">{value}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {omitted > 0 && (
        <p className="mt-2 text-muted-foreground text-sm">
          {t("interaction.approvalMoreParams", { count: omitted })}
        </p>
      )}
    </>
  );
}
