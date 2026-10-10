import type { ChannelConnection } from "@houston/engine-adapter";
import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

export function ChannelConnectionRow({
  connection,
  busy,
  onDisconnect,
}: {
  connection: ChannelConnection;
  busy: boolean;
  onDisconnect: (connection: ChannelConnection) => void;
}) {
  const { t } = useTranslation("settings");
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="break-words text-sm text-ink">
          {connection.accountLabel}
        </p>
        <p className="text-xs text-ink-muted">{t("channels.connected")}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => onDisconnect(connection)}
      >
        {t("channels.disconnect")}
      </Button>
    </div>
  );
}
