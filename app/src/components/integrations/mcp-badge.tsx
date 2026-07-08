import { Badge } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/**
 * The "MCP" pill shown on cards and in the detail sheet for remote MCP server
 * integrations the user added themselves (provider `"mcp"`), so they read as
 * distinct from the OAuth catalog and from custom API-key integrations.
 * Presentational; the caller decides where it renders.
 */
export function McpBadge({ className }: { className?: string }) {
  const { t } = useTranslation("integrations");
  return (
    <Badge variant="secondary" className={className}>
      {t("mcp.badge")}
    </Badge>
  );
}
