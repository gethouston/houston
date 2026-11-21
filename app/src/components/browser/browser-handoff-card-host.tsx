import { BrowserHandoffCard } from "@houston-ai/chat";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BrowserHandoffCardPayload } from "../../lib/browser-handoff-feed";
import { BrowserLiveDialog } from "./browser-live-dialog";

export function BrowserHandoffCardHost({
  card,
  agentPath,
}: {
  card: BrowserHandoffCardPayload;
  agentPath: string;
}) {
  const { t } = useTranslation("chat");
  const [open, setOpen] = useState(false);
  const labels = useMemo(
    () => ({
      heading: (site: string) => t("browserHandoff.heading", { site }),
      headingNoSite: t("browserHandoff.headingNoSite"),
      open: t("browserHandoff.open"),
      openLabel: (site: string | null) =>
        site
          ? t("browserHandoff.openLabel", { site })
          : t("browserHandoff.openLabelNoSite"),
      done: t("browserHandoff.done"),
      cancelled: t("browserHandoff.cancelled"),
      expired: t("browserHandoff.expired"),
      ended: t("browserHandoff.ended"),
    }),
    [t],
  );

  return (
    <>
      <BrowserHandoffCard
        labels={labels}
        onOpen={() => setOpen(true)}
        site={card.site}
        state={card.state}
        task={card.text}
      />
      <BrowserLiveDialog
        agentPath={agentPath}
        conversationId={card.conversationId}
        onOpenChange={setOpen}
        open={open}
        task={card.text}
      />
    </>
  );
}
