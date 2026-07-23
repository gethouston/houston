import { StatusBadge } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

export type ConnectionStatus = "active" | "pending" | "error";

/**
 * Colored dot + colored, localized label describing a connection's live status
 * — the sober "green thing next to the name" treatment, not a tinted card
 * background. A thin i18n wrapper over the shared `ui/core` {@link StatusBadge}:
 * it maps the connection status to its localized `integrations` label; the dot,
 * proportions, and color tokens live once in the primitive so "connected" reads
 * identically across every surface.
 */
export function ConnectionStatusBadge({
  status,
}: {
  status: ConnectionStatus;
}) {
  const { t } = useTranslation("integrations");
  return <StatusBadge status={status} label={t(`status.${status}`)} />;
}
