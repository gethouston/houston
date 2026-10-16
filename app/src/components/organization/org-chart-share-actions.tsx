import { checkLinkedInText } from "@houston/sdk";
import { Button, cn, Spinner } from "@houston-ai/core";
import { ExternalLink, Linkedin } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PRESS_CLASS, PRESS_STYLE } from "./org-chart-motion";
import type { useOrgChartShare } from "./use-org-chart-share";

type Share = ReturnType<typeof useOrgChartShare>;

/** A pill that presses in. */
export function ShareButton({
  icon,
  label,
  className,
  ...props
}: { icon: ReactNode; label: string } & ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn("rounded-full", PRESS_CLASS, className)}
      style={PRESS_STYLE}
      {...props}
    >
      {icon}
      {label}
    </Button>
  );
}

const linkedInIcon = <Linkedin className="size-4" />;
const INLINE_LINK =
  "rounded-sm font-medium text-ink underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50";
const spinner = <Spinner aria-hidden />;

/**
 * The dialog's primary button for where it stands (`shareStep`), with what
 * belongs right under it: whose LinkedIn a post goes to (and Disconnect), or
 * that a connect is waiting on the LinkedIn window (and Start over). The
 * post's words are checked as the gateway counts them (`checkLinkedInText`);
 * copy and paste only needs some.
 */
export function SharePrimary({ share }: { share: Share }) {
  const { t } = useTranslation("teams");
  const { step } = share;
  const words = checkLinkedInText(share.text);
  const empty = words.kind === "empty";
  const primary = "h-10 w-full";

  if (step.kind === "posted")
    return (
      <ShareButton
        icon={<ExternalLink className="size-4" />}
        label={t("orgChart.share.viewPost")}
        className={primary}
        onClick={() => share.viewPost(step.postUrl)}
      />
    );
  if (step.kind === "connect")
    return (
      <div className="flex flex-col gap-2">
        <ShareButton
          icon={step.phase === "idle" ? linkedInIcon : spinner}
          label={t("orgChart.share.connect")}
          disabled={step.phase !== "idle"}
          className={primary}
          onClick={share.connect}
        />
        {step.phase === "waiting" && (
          <p className="flex flex-wrap items-center gap-x-1 text-xs text-pretty text-ink-muted">
            <span>{t("orgChart.share.connectWaiting")}</span>
            <button
              type="button"
              onClick={share.connect}
              className={INLINE_LINK}
            >
              {t("orgChart.share.connectRestart")}
            </button>
          </p>
        )}
      </div>
    );
  if (step.kind === "post")
    return (
      <div className="flex flex-col gap-2">
        <ShareButton
          icon={step.posting ? spinner : linkedInIcon}
          label={t(
            step.posting
              ? "orgChart.share.posting"
              : "orgChart.share.postButton",
          )}
          disabled={
            step.posting ||
            share.postHeld ||
            !share.ready ||
            words.kind !== "ok"
          }
          className={primary}
          onClick={share.post}
        />
        {words.kind === "tooLong" && (
          <p className="text-xs text-pretty text-ink">
            {t("orgChart.share.tooLong", { count: words.over })}
          </p>
        )}
        <p className="flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-ink-muted">
          <span className="min-w-0 truncate">
            {t("orgChart.share.postingAs", { name: step.name })}
          </span>
          <span aria-hidden>·</span>
          <button
            type="button"
            disabled={share.disconnecting || step.posting}
            onClick={share.disconnect}
            className={INLINE_LINK}
          >
            {t("orgChart.share.disconnect")}
          </button>
        </p>
      </div>
    );
  const checking = step.kind === "checking";
  return (
    <ShareButton
      icon={checking ? spinner : linkedInIcon}
      label={t("orgChart.share.linkedIn")}
      disabled={checking || !share.ready || empty}
      className={primary}
      onClick={share.share}
    />
  );
}
