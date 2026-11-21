import { AsyncButton, Button } from "@houston-ai/core";
import { Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProviderConnectionState } from "../../lib/provider-connection";
import type { ProviderInfo } from "../../lib/providers";
import { LiveStatus } from "../ai-hub/hub-badges";
import { BrandMark } from "./brand-mark";

interface ProviderRowProps {
  provider: ProviderInfo;
  modelCount: number;
  description: string;
  connection: ProviderConnectionState;
  connecting: boolean;
  signingOut: boolean;
  onConnect: (provider: ProviderInfo) => void;
  onCancel: (provider: ProviderInfo) => void;
  onSignOut: (provider: ProviderInfo) => void;
}

export function ProviderRow({
  provider,
  modelCount,
  description,
  connection,
  connecting,
  signingOut,
  onConnect,
  onCancel,
  onSignOut,
}: ProviderRowProps) {
  const { t } = useTranslation("aiHub");
  const connected = connection === "connected";

  return (
    <div className="flex items-center gap-3 rounded-xl bg-chip px-3 py-2.5 text-left">
      <BrandMark providerId={provider.id} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-ink">
          <span className="min-w-0 truncate">{provider.name}</span>
          {connected && <LiveStatus label={t("card.connected")} />}
        </span>
        <span className="truncate text-[11px] text-ink-muted">
          {modelCount > 0 && (
            <>
              <span className="font-medium text-ink">
                {t("card.models", { count: modelCount })}
              </span>
              {" · "}
            </>
          )}
          {description}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {connection === "checking" ? (
          <span className="px-3 text-[13px] text-ink-muted">
            {t("card.checking")}
          </span>
        ) : connected ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-ink-muted"
            disabled={signingOut}
            onClick={() => onSignOut(provider)}
          >
            {t("card.signOut")}
          </Button>
        ) : (
          <AsyncButton
            size="sm"
            variant="secondary"
            spinner={false}
            className="group/connect relative min-w-[92px]"
            aria-label={
              connecting
                ? t("card.cancel")
                : t("card.connectName", { name: provider.name })
            }
            onClick={() =>
              connecting ? onCancel(provider) : onConnect(provider)
            }
          >
            {connecting ? (
              <>
                <span className="flex items-center justify-center gap-1.5 transition-opacity group-hover/connect:opacity-0">
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  {t("card.connecting")}
                </span>
                <span className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0 transition-opacity group-hover/connect:opacity-100">
                  <X className="size-3.5" aria-hidden="true" />
                  {t("card.cancel")}
                </span>
              </>
            ) : (
              t("card.connect")
            )}
          </AsyncButton>
        )}
      </div>
    </div>
  );
}
