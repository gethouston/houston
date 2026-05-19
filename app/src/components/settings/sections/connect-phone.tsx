import { useCallback, useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Badge, Button, ConfirmDialog } from "@houston-ai/core";
import { QRCodeSVG } from "qrcode.react";
import { tauriTunnel } from "../../../lib/tauri";
import { logger } from "../../../lib/logger";
import { useUIStore } from "../../../stores/ui";

interface TunnelInfo {
  connected: boolean;
  publicHost: string | null;
}

const STATUS_POLL_MS = 2_000;

export function ConnectPhoneSection() {
  const { t } = useTranslation(["settings", "common"]);
  const addToast = useUIStore((s) => s.addToast);

  const [info, setInfo] = useState<TunnelInfo | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const mountedRef = useRef(false);

  const loadStatus = useCallback(async () => {
    try {
      const s = await tauriTunnel.status();
      setInfo({ connected: s.connected, publicHost: s.publicHost });
    } catch (e) {
      logger.warn("tunnel.status failed", String(e));
    }
  }, []);

  const mintCode = useCallback(async () => {
    try {
      const p = await tauriTunnel.mintPairingCode();
      setPairingCode(p.code);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /tunnel allocation|tunnel not configured/i.test(msg)
          ? t("settings:connectPhone.errors.noInternet")
          : t("settings:connectPhone.errors.generic"),
      );
    }
  }, [t]);

  useEffect(() => {
    mountedRef.current = true;
    void loadStatus();
    const id = setInterval(() => {
      if (mountedRef.current) void loadStatus();
    }, STATUS_POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [loadStatus]);

  useEffect(() => {
    if (info?.connected) {
      void mintCode();
    } else {
      setPairingCode(null);
    }
  }, [info?.connected, mintCode]);

  const qrUrl =
    pairingCode && info?.connected && info.publicHost
      ? `${info.publicHost.startsWith("localhost") ? "http" : "https"}://${info.publicHost}/pair/${pairingCode}`
      : null;

  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      await tauriTunnel.resetAccess();
      setConfirmOpen(false);
      setPairingCode(null);
      void loadStatus();
      addToast({ title: t("settings:connectPhone.reset.toast") });
    } finally {
      setResetting(false);
    }
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-lg font-semibold">
          {t("settings:connectPhone.title")}
        </h2>
        <Badge
          variant="outline"
          className="h-4 px-1.5 text-[9px] font-semibold tracking-wider text-muted-foreground"
        >
          BETA
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        {t("settings:connectPhone.description")}
      </p>

      <div className="flex flex-col items-center gap-3">
        {qrUrl ? (
          <div className="rounded-xl border border-border/50 bg-white p-4">
            <QRCodeSVG
              value={qrUrl}
              size={220}
              level="M"
              bgColor="transparent"
              fgColor="#0d0d0d"
            />
          </div>
        ) : error ? (
          <div className="rounded-lg bg-destructive/10 px-3 py-6 text-center text-sm text-destructive max-w-[260px]">
            {error}
          </div>
        ) : (
          <div className="size-[220px] rounded-xl bg-muted/40 animate-pulse flex items-center justify-center">
            <p className="text-[11px] text-muted-foreground text-center px-6 leading-relaxed">
              {t("settings:connectPhone.loading")}
            </p>
          </div>
        )}

        {info && !info.connected && !error && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800 leading-relaxed text-center max-w-[260px]">
            {t("settings:connectPhone.connectingStatus")}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed text-center max-w-[260px]">
          {t("settings:connectPhone.keepComputerAwake")}
          <br />
          <Trans
            i18nKey="settings:connectPhone.alwaysOnHint"
            components={{ emph: <span className="underline underline-offset-2" /> }}
          />
        </p>
      </div>

      <div className="mt-8 pt-6 border-t border-border">
        <h3 className="text-sm font-medium mb-1">
          {t("settings:connectPhone.reset.title")}
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          {t("settings:connectPhone.reset.description")}
        </p>
        <Button
          variant="outline"
          className="rounded-full"
          disabled={resetting}
          onClick={() => setConfirmOpen(true)}
        >
          {t("settings:connectPhone.reset.button")}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("settings:connectPhone.reset.confirmTitle")}
        description={t("settings:connectPhone.reset.confirmDescription")}
        confirmLabel={t("settings:connectPhone.reset.confirmLabel")}
        cancelLabel={t("common:actions.cancel")}
        variant="destructive"
        onConfirm={handleReset}
      />
    </section>
  );
}
