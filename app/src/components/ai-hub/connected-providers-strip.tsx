import { CatalogGrid, CatalogShowMore } from "@houston-ai/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProviderUsage } from "../../hooks/queries";
import { installedPreview } from "../../lib/installed-preview";
import type { ProviderConnectionState } from "../../lib/provider-connection";
import type { ProviderInfo } from "../../lib/providers";
import { ConnectedProviderRow } from "./connected-provider-row";
import {
  hasConfirmedAccount,
  matchUsageToProviders,
  type UsageFetchState,
} from "./provider-usage-model";

/**
 * How many connected accounts the strip previews at rest.
 *
 * Deliberately below the shared `CATALOG_INSTALLED_PREVIEW_CAP` (6): that cap
 * was tuned for the ~56px rows the skills and integrations strips show, and a
 * connected provider row now measures 136px because it carries the account's
 * meters. `CatalogGrid` is single-column below `lg`, so six would be ~820px of
 * strip between the hero and the discovery tabs — the tabs would open below the
 * fold on a laptop. Three is ~416px there (and ~276px in the two-column layout),
 * which keeps "Connected" and the tabs on screen together; the "Show all"
 * expander, and searching (which uncaps), reach the rest.
 */
const CONNECTED_PREVIEW_CAP = 3;

/**
 * The hub's consolidated "Connected" strip in the catalog ROW grammar the
 * browse lists use: every connected AI provider as a flat catalog row — the
 * full-color brand mark, the provider name, one muted line naming how it is
 * connected, and, underneath, that account's LIVE usage (plan, rate-limit
 * meters, prepaid balance or metered spend). Usage has no separate surface: an
 * account and how much of it is left are one thing, so they render as one row
 * (HOU-789). The row BODY opens that provider's detail modal (sign-out and its
 * model list live there). It sits OUTSIDE the discovery tabs (identity, not
 * discovery).
 *
 * The page's ONE search field narrows this strip: the parent passes the already
 * matched `providers` (and omits the whole section when a live query matches
 * none), so the strip owns only its own usage fetch. At rest it shows at most
 * {@link CONNECTED_PREVIEW_CAP} rows behind a "Show all" expander so a
 * well-stocked strip never buries the tabs; while `searching` every match shows
 * uncapped (searching IS looking past the preview).
 *
 * The strip is the "yours" side, so it also carries the providers whose probe
 * could not be confirmed (HOU-979): they belong with the user's accounts rather
 * than in the browse tab's connect-me list, but they must NOT borrow the green
 * Connected dot. Each row reads its own state and shows the pending dot instead
 * — honest, and still no Connect CTA anywhere on this strip. An unconfirmed row
 * also shows no usage tier at all, and its presence never triggers the fetch:
 * Houston makes no metering claim about an account it could not read.
 */
export function ConnectedProvidersStrip({
  providers,
  connectionState,
  searching,
  onOpen,
}: {
  /** The user's providers to render — already narrowed by the page query. */
  providers: readonly ProviderInfo[];
  /** Per-provider connection state, from the ONE shared derivation. */
  connectionState: (provider: ProviderInfo) => ProviderConnectionState;
  /** Whether the page query is active (uncaps the preview). */
  searching: boolean;
  onOpen: (provider: ProviderInfo) => void;
}) {
  const { t } = useTranslation("aiHub");
  const [expanded, setExpanded] = useState(false);
  // The strip's MOUNT is not the gate: this list means "the user's accounts",
  // which by design includes the ones whose probe could not be confirmed, and
  // `providerUsage()` throws rather than fabricate a reading. One confirmed
  // account is the real precondition, so it is stated here.
  const enabled = useMemo(
    () => hasConfirmedAccount(providers, connectionState),
    [providers, connectionState],
  );
  const { data: usageRows, isLoading, isError } = useProviderUsage(enabled);
  // TanStack keeps the last good `data` through a failed BACKGROUND refetch, so
  // a single blip must not blank every meter on the strip: the rows only fall
  // back to the honest error note when there is nothing to show at all.
  const usageFetchState: UsageFetchState = isLoading
    ? "loading"
    : isError && !usageRows
      ? "error"
      : "ready";

  // A live query shows every match; at rest the strip caps its rows so a full
  // strip never pushes the discovery tabs below the fold.
  const { visible: rows, showExpander } = installedPreview(providers, {
    searching,
    expanded,
    cap: CONNECTED_PREVIEW_CAP,
  });
  const accounts = useMemo(
    () => matchUsageToProviders(rows, usageRows ?? []),
    [rows, usageRows],
  );

  return (
    <div>
      {/* Wider than the catalog default (4px): these rows paint a surface and a
          hairline of their own, and two cards a hairline apart read as one
          split card. 8px is the smallest step that separates them. */}
      <CatalogGrid className="gap-2">
        {accounts.map((account) => (
          <ConnectedProviderRow
            key={account.provider.id}
            account={account}
            connectionState={connectionState(account.provider)}
            usageFetchState={usageFetchState}
            onOpen={() => onOpen(account.provider)}
          />
        ))}
      </CatalogGrid>
      {showExpander && (
        <CatalogShowMore onClick={() => setExpanded(true)}>
          {t("search.showAll", { count: providers.length })}
        </CatalogShowMore>
      )}
    </div>
  );
}
