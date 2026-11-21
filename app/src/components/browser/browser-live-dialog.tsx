import { BrowserLiveView, type BrowserLiveViewLabels } from "@houston-ai/chat";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  useIsMobile,
} from "@houston-ai/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useBrowserLive } from "../../hooks/use-browser-live";

export interface BrowserLiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentPath: string;
  conversationId: string;
  task: string;
}

function useBrowserLiveLabels(): BrowserLiveViewLabels {
  const { t } = useTranslation("chat");
  return useMemo(
    () => ({
      privacy: t("browserLive.privacy"),
      back: t("browserLive.back"),
      address: t("browserLive.address"),
      addressRefused: t("browserLive.addressRefused"),
      finish: t("browserLive.finish"),
      cancel: t("browserLive.cancel"),
      close: t("browserLive.close"),
      connecting: t("browserLive.connecting"),
      reconnecting: t("browserLive.reconnecting"),
      lost: t("browserLive.lost"),
      retry: t("browserLive.retry"),
      endedDone: t("browserLive.endedDone"),
      endedCancelled: t("browserLive.endedCancelled"),
      endedExpired: t("browserLive.endedExpired"),
      endedNone: t("browserLive.endedNone"),
      notOwner: t("browserLive.notOwner"),
      tapToType: t("browserLive.tapToType"),
      leavePage: t("browserLive.leavePage"),
      website: t("browserLive.website"),
      timeLeft: (minutes) => t("browserLive.timeLeft", { minutes }),
      timeLeftLastMinute: t("browserLive.timeLeftLastMinute"),
      showMore: t("browserLive.showMore"),
      showLess: t("browserLive.showLess"),
    }),
    [t],
  );
}

function keepPageEscape(event: KeyboardEvent) {
  if (
    event.target instanceof Element &&
    event.target.closest("[data-browser-live-stage]")
  )
    event.preventDefault();
}

function focusFrame(event: Event) {
  event.preventDefault();
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
}

export function BrowserLiveDialog({
  open,
  onOpenChange,
  agentPath,
  conversationId,
  task,
}: BrowserLiveDialogProps) {
  const { t } = useTranslation("chat");
  const isMobile = useIsMobile();
  const labels = useBrowserLiveLabels();
  const session = useBrowserLive({
    agentPath,
    conversationId,
    open,
    onFinished: () => onOpenChange(false),
  });
  const body = (
    <BrowserLiveView
      {...session}
      labels={labels}
      onClose={() => onOpenChange(false)}
      task={task}
    />
  );
  const title = t("browserLive.title");

  if (isMobile)
    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent
          className="browser-live-sheet h-dvh gap-0 p-0 pt-safe"
          onEscapeKeyDown={keepPageEscape}
          onOpenAutoFocus={focusFrame}
          showCloseButton={false}
          side="bottom"
        >
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <SheetDescription className="sr-only">{task}</SheetDescription>
          {body}
        </SheetContent>
      </Sheet>
    );
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="browser-live-dialog flex h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(72rem,calc(100%-2rem))]"
        onEscapeKeyDown={keepPageEscape}
        onOpenAutoFocus={focusFrame}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{task}</DialogDescription>
        {body}
      </DialogContent>
    </Dialog>
  );
}
