import {
  type ChannelLink,
  channelConnectCommand,
} from "@houston/engine-adapter";
import { Button, Input } from "@houston-ai/core";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { channelLinkExpired } from "../../../lib/channel-link-expiry";
import { showErrorToast } from "../../../lib/error-toast";
import { useChannelLinkExpired } from "./use-channel-link-expired";

export function ChannelLinkCommand({
  link,
  instruction,
  label,
}: {
  link: ChannelLink;
  instruction: string;
  label: string;
}) {
  const { t, i18n } = useTranslation("settings");
  const [copied, setCopied] = useState(false);
  const expired = useChannelLinkExpired(link.expiresAt);
  const command = channelConnectCommand(link.code);
  async function copy() {
    if (channelLinkExpired(link.expiresAt)) {
      return;
    }
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch (error) {
      showErrorToast(
        "copy_channel_command",
        "Unable to copy channel command",
        error,
      );
    }
  }
  return (
    <div className="space-y-3 rounded-xl bg-input p-4">
      <p className="text-sm text-ink">{instruction}</p>
      {expired ? (
        <p role="status" className="text-sm text-ink-muted">
          {t("channels.linkExpired")}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              readOnly
              aria-label={label}
              value={command}
              className="font-mono text-base"
            />
            <Button variant="outline" onClick={() => void copy()}>
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
              {t(copied ? "channels.copied" : "channels.copy")}
            </Button>
          </div>
          <p className="text-xs text-ink-muted">
            {t("channels.linkExpires", {
              time: new Intl.DateTimeFormat(i18n.language, {
                timeStyle: "short",
              }).format(new Date(link.expiresAt)),
            })}
          </p>
        </>
      )}
    </div>
  );
}
