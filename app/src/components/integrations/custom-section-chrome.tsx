import { CatalogShell } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "./section-header";

/**
 * The custom-integrations section's `"section"`-variant header: the classic
 * heading + count + description beside the Add button (the standalone block
 * the global page's non-ready states embed). The `"tab"` variant has no
 * header chrome of its own — it renders through {@link CustomModeShell}.
 */
export function CustomSectionChrome({
  count,
  addButton,
}: {
  count: number;
  addButton: ReactNode;
}) {
  const { t } = useTranslation("integrations");
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <SectionHeader title={t("custom.title")} count={count} />
        <p className="mt-0.5 text-[13px] text-ink-muted">
          {t("custom.description")}
        </p>
      </div>
      {addButton}
    </div>
  );
}

/**
 * The Custom MODE's layout (HOU-980 review): the same {@link CatalogShell}
 * grammar as the Composio mode — an **Installed** card holding the custom
 * rows — so switching the page-level source toggle swaps like for like. Its
 * controls (this mode's search + the Add button) are {@link CustomControls},
 * rendered by the section through the page header's tools portal exactly as
 * the catalog mode's are, so they live in the strip when the width holds them
 * and in a row above this card when it does not. No description line: the
 * toggle names the surface and the Add dialog explains the rest. The caller
 * renders the rows (`children`); with a live query matching nothing it passes
 * `count` 0 and shows its own no-results line under the shell.
 */
export function CustomModeShell({
  count,
  children,
}: {
  /** How many rows currently show (matches while filtering, total at rest). */
  count: number;
  children?: ReactNode;
}) {
  const { t } = useTranslation("integrations");
  return (
    <CatalogShell
      installedTitle={t("home.installedTitle")}
      installed={count > 0 ? children : undefined}
      tabs={[]}
    />
  );
}
