import { StatusBadge } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

export type ConnectionStatus = "active" | "pending" | "error";

export function ConnectionStatusBadge({
  status,
}: {
  status: ConnectionStatus;
}) {
  const { t } = useTranslation("integrations");
  return <StatusBadge status={status} label={t(`status.${status}`)} />;
}
