import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { BridgeStatusKind } from "../../lib/local-model";

const DOT_CLASS: Record<BridgeStatusKind, string> = {
  online: "bg-success",
  connecting: "bg-warning animate-pulse",
  offline: "bg-ink-muted",
  error: "bg-danger",
  disabled: "bg-ink-muted",
  reconnecting: "bg-warning motion-safe:animate-pulse",
  model_unavailable: "bg-warning",
  authorization_required: "bg-warning",
  revoked: "bg-ink-muted",
  reconnect_required: "bg-warning",
};

export function LocalModelStatusPill({
  status,
  appName,
  onRetry,
  retrying,
}: {
  status: BridgeStatusKind;
  appName?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { t } = useTranslation("providers");
  const down = [
    "offline",
    "error",
    "model_unavailable",
    "authorization_required",
    "revoked",
    "reconnect_required",
  ].includes(status);
  const hint =
    status === "authorization_required"
      ? "localModel.status.authorizationHint"
      : status === "revoked"
        ? "localModel.status.revokedHint"
        : status === "reconnect_required"
          ? "localModel.status.reconnectHint"
          : "localModel.status.offlineHint";

  return (
    <div className="flex flex-col gap-1.5">
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-chip px-2 py-0.5 text-[11px] font-medium text-ink-muted">
        <span
          className={`size-1.5 rounded-full ${DOT_CLASS[status]}`}
          aria-hidden="true"
        />
        {t(`localModel.status.${status}`)}
      </span>
      {down && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[12px] leading-relaxed text-ink-muted">
            {t(hint, {
              app: appName || t("localModel.status.yourApp"),
            })}
          </p>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={onRetry}
              disabled={retrying}
            >
              {t("localModel.status.reconnect")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
