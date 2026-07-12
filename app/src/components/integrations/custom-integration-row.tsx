import { Button } from "@houston-ai/core";
import type { CustomIntegrationView } from "@houston-ai/engine-client";
import { KeyRound, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { customKindBadgeKey } from "./custom-integrations-model";

interface CustomIntegrationRowProps {
  integration: CustomIntegrationView;
  onEnterKey: (integration: CustomIntegrationView) => void;
  onRemove: (integration: CustomIntegrationView) => void;
}

/** The status line under the name: tool count (active), a needs-key prompt
 *  (pending), or the error message (error, tinted). */
function StatusLine({ integration }: { integration: CustomIntegrationView }) {
  const { t } = useTranslation("integrations");
  const state = integration.state;
  if (state.status === "active")
    return (
      <p className="text-[11px] text-ink-muted">
        {t("custom.toolCount", { count: state.toolCount })}
      </p>
    );
  if (state.status === "pending")
    return (
      <p className="text-[11px] text-ink-muted">
        {t("custom.status.pendingKey")}
      </p>
    );
  return (
    <p className="truncate text-[11px] text-danger" title={state.message}>
      {t("custom.status.error", { message: state.message })}
    </p>
  );
}

/**
 * One custom integration on the Integrations page, in the same card language as
 * the connected-apps rows: name + a connection-type badge ("API" / "MCP server")
 * on the top line, a status line under it, and always-visible trailing actions —
 * an "Enter key" button while it waits on a secret, plus a Remove button (no
 * hover gating). Presentational; the parent owns the key dialog + delete confirm.
 */
export function CustomIntegrationRow({
  integration,
  onEnterKey,
  onRemove,
}: CustomIntegrationRowProps) {
  const { t } = useTranslation("integrations");
  const pending = integration.state.status === "pending";

  return (
    <div className="flex items-center gap-3 rounded-xl bg-chip px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-ink">
          <span className="min-w-0 truncate">{integration.name}</span>
          <span className="shrink-0 rounded-full bg-chip-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
            {t(customKindBadgeKey(integration.kind))}
          </span>
        </p>
        <StatusLine integration={integration} />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {pending && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => onEnterKey(integration)}
          >
            <KeyRound className="size-3.5" />
            {t("custom.enterKey")}
          </Button>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t("custom.delete.confirm")}
          onClick={() => onRemove(integration)}
        >
          <Trash2 className="size-4 text-ink-muted" />
        </Button>
      </div>
    </div>
  );
}
