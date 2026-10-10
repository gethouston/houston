import type { WhatsAppLink } from "@houston/engine-adapter";
import { Button } from "@houston-ai/core";
import { isTauri } from "@tauri-apps/api/core";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { openLinkOutside } from "../../../lib/external-link-click";
import { openExternalUrl } from "../../../lib/open-external-url";
import { ChannelLinkCommand } from "./channel-link-command";
import { useChannelLinkExpired } from "./use-channel-link-expired";

/**
 * "Open WhatsApp" as a real link. A click on an anchor is the one open no
 * popup blocker refuses, and on a phone it hands `wa.me` to the WhatsApp app
 * instead of orphaning a blank tab behind a script open. The desktop webview
 * opens no windows, so there the click goes to the OS browser, which reports
 * its own failure (`open-external-url.ts`). While another channel call is in
 * flight it is a disabled button: the code it carries may be on its way out.
 */
function WhatsAppOpenAction({
  url,
  busy,
  className,
  variant,
}: {
  url: string;
  busy: boolean;
  className?: string;
  variant?: "default" | "link";
}) {
  const { t } = useTranslation("settings");
  const label = t("channels.whatsapp.open");
  if (busy) {
    return (
      <Button className={className} variant={variant} disabled>
        {label}
      </Button>
    );
  }
  return (
    <Button className={className} variant={variant} asChild>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) =>
          openLinkOutside(event, url, {
            desktop: isTauri(),
            open: (target) =>
              openExternalUrl(target, { command: "open_whatsapp" }),
          })
        }
      >
        {label}
      </a>
    </Button>
  );
}

/**
 * The code a WhatsApp connect minted. A phone opens WhatsApp with the message
 * prefilled; a desktop shows a QR code for the phone to scan. Either way the
 * number and the command stay reachable for typing it by hand.
 */
export function WhatsAppLinkDetails({
  link,
  busy,
  waiting,
}: {
  link: WhatsAppLink;
  busy: boolean;
  waiting: boolean;
}) {
  const { t } = useTranslation("settings");
  const expired = useChannelLinkExpired(link.expiresAt);
  const command = (instruction: string) => (
    <ChannelLinkCommand
      key={link.code}
      link={link}
      instruction={instruction}
      label={t("channels.whatsapp.commandLabel")}
    />
  );
  const sendTo = t("channels.whatsapp.sendTo", { phone: link.phoneNumber });
  return (
    <div className="space-y-3">
      {expired ? (
        command(sendTo)
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            <WhatsAppOpenAction url={link.url} busy={busy} className="w-full" />
            <p className="text-sm text-ink-muted">
              {t("channels.whatsapp.ready")}
            </p>
            <details className="text-sm text-ink">
              <summary className="cursor-pointer">
                {t("channels.whatsapp.typeInstead")}
              </summary>
              <div className="mt-3">{command(sendTo)}</div>
            </details>
          </div>
          <div className="hidden space-y-3 md:block">
            {/* Dark modules on a light tile in every theme: an inverted code
                fails many phone scanners. */}
            <div className="inline-block rounded-xl bg-qr-tile p-3">
              <QRCodeSVG
                value={link.url}
                className="size-40 text-qr-ink"
                fgColor="currentColor"
                bgColor="transparent"
                role="img"
                aria-label={t("channels.whatsapp.qrLabel")}
                data-qr-value={link.url}
              />
            </div>
            <p className="text-sm text-ink-muted">
              {t("channels.whatsapp.scan")}
            </p>
            {command(
              t("channels.whatsapp.orSendTo", { phone: link.phoneNumber }),
            )}
            <WhatsAppOpenAction url={link.url} busy={busy} variant="link" />
          </div>
        </>
      )}
      {waiting && !expired && (
        <p role="status" className="text-sm text-ink-muted">
          {t("channels.whatsapp.waiting")}
        </p>
      )}
    </div>
  );
}
