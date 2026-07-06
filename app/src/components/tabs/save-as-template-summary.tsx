import { Spinner } from "@houston-ai/core";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import {
  providerBrand,
  type SpecSummarySegment,
} from "./save-as-template-model";

/** One summary segment ("3 skills", "Claude", ...) as localized text. */
function segmentLabel(
  segment: SpecSummarySegment,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  switch (segment.kind) {
    case "instructions":
      return t("templates.save.summary.instructions");
    case "skills":
      return t("templates.save.summary.skills", { count: segment.count });
    case "model":
      return providerBrand(segment.provider) ?? segment.model ?? "";
    case "allApps":
      return t("templates.save.summary.allApps");
    case "apps":
      return t("templates.save.summary.apps", { count: segment.count });
  }
}

/**
 * The plain-language "what this captures" block — an interpunct-joined list of
 * the template's contents ("Instructions · 3 skills · Claude · 2 allowed apps"),
 * or a spinner while the source queries are still loading.
 */
export function CapturedSummary({
  segments,
  loading,
}: {
  segments: SpecSummarySegment[];
  loading: boolean;
}) {
  const { t } = useTranslation("teams");
  return (
    <div className="rounded-xl bg-secondary px-4 py-3">
      <p className="mb-1 text-xs font-medium text-foreground">
        {t("templates.save.capturedTitle")}
      </p>
      {loading ? (
        <Spinner className="size-4" />
      ) : (
        <p className="text-xs text-muted-foreground">
          {segments.map((segment, i) => (
            <Fragment key={segment.kind}>
              {i > 0 && <span className="mx-1.5">·</span>}
              {segmentLabel(segment, t)}
            </Fragment>
          ))}
        </p>
      )}
    </div>
  );
}
