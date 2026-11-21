import { cn, Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { ConnectFlow } from "./connect-flow-registry";
import { ConnectNoticeLine, NoticeLine } from "./connect-notice-line";
import { WaitingBlock } from "./connect-waiting-block";

export type ConnectFlowVariant = "panel" | "bare";

export function hasConnectState(
  connectFlow: ConnectFlow,
  toolkit: string,
): boolean {
  return toolkit in connectFlow.states || toolkit in connectFlow.notices;
}

export function ConnectFlowInline({
  toolkit,
  appName,
  connectFlow,
  className,
  variant = "panel",
}: {
  toolkit: string;
  appName: string;
  connectFlow: ConnectFlow;
  className?: string;
  variant?: ConnectFlowVariant;
}) {
  const { t } = useTranslation("integrations");
  const step = connectFlow.states[toolkit];
  const notice = connectFlow.notices[toolkit];

  if (!step && !notice) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("text-[13px]", className)}
    >
      {step === "waiting" || step === "blocked" ? (
        <WaitingBlock
          appName={appName}
          toolkit={toolkit}
          connectFlow={connectFlow}
          variant={variant}
          blocked={step === "blocked"}
        />
      ) : step === "starting" ? (
        <NoticeLine
          icon={
            variant === "panel" ? <Spinner className="size-3.5" /> : undefined
          }
          tone="muted"
        >
          {t("waiting.opening", { app: appName })}
        </NoticeLine>
      ) : notice ? (
        <ConnectNoticeLine appName={appName} notice={notice} />
      ) : null}
    </div>
  );
}
