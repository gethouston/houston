import { checkLinkedInText } from "@houston/sdk";
import { Button, cn, Spinner } from "@houston-ai/core";
import type { TFunction } from "i18next";
import { ExternalLink, Linkedin } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PRESS_CLASS, PRESS_STYLE, STEP_PRESS_STYLE } from "./org-chart-motion";
import { primaryVariant } from "./org-chart-share-step";
import type { useOrgChartShare } from "./use-org-chart-share";
import { useSwapIn } from "./use-swap-in";

type Share = ReturnType<typeof useOrgChartShare>;

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

function StepButton({
  icon,
  label,
  ...props
}: { icon: ReactNode; label: string } & ComponentProps<typeof Button>) {
  const content = useSwapIn<HTMLSpanElement>(label);
  return (
    <Button
      className={cn("h-10 w-full rounded-full", PRESS_CLASS)}
      style={STEP_PRESS_STYLE}
      {...props}
    >
      <span ref={content} className="inline-flex items-center gap-2">
        {icon}
        {label}
      </span>
    </Button>
  );
}

const linkedInIcon = <Linkedin className="size-4" />;
const INLINE_LINK =
  "rounded-sm font-medium text-ink underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50";
const spinner = <Spinner aria-hidden />;

type LinkedInTextCheck = ReturnType<typeof checkLinkedInText>;

type StepProps = Pick<ComponentProps<typeof Button>, "disabled" | "onClick"> & {
  icon: ReactNode;
  label: string;
};

function stepProps(
  share: Share,
  words: LinkedInTextCheck,
  t: TFunction<"teams">,
): StepProps {
  const { step } = share;
  switch (step.kind) {
    case "posted":
      return {
        icon: <ExternalLink className="size-4" />,
        label: t("orgChart.share.viewPost"),
        onClick: () => share.viewPost(step.postUrl),
      };
    case "connect":
      return {
        icon: step.phase === "idle" ? linkedInIcon : spinner,
        label: t("orgChart.share.connect"),
        disabled: step.phase !== "idle",
        onClick: share.connect,
      };
    case "post":
      return {
        icon: step.posting ? spinner : linkedInIcon,
        label: t(
          step.posting ? "orgChart.share.posting" : "orgChart.share.postButton",
        ),
        disabled:
          step.posting || share.postHeld || !share.ready || words.kind !== "ok",
        onClick: share.post,
      };
    case "share":
    case "checking":
      return {
        icon: step.kind === "checking" ? spinner : linkedInIcon,
        label: t("orgChart.share.linkedIn"),
        disabled:
          step.kind === "checking" || !share.ready || words.kind === "empty",
        onClick: share.share,
      };
  }
}

export function SharePrimary({ share }: { share: Share }) {
  const { t } = useTranslation("teams");
  const { step } = share;
  const words = checkLinkedInText(share.text);
  return (
    <div className="flex flex-col gap-2">
      <StepButton
        variant={primaryVariant(step)}
        {...stepProps(share, words, t)}
      />
      {step.kind === "connect" && step.phase === "waiting" && (
        <p className="flex flex-wrap items-center gap-x-1 text-xs text-pretty text-ink-muted">
          <span>{t("orgChart.share.connectWaiting")}</span>
          <button type="button" onClick={share.connect} className={INLINE_LINK}>
            {t("orgChart.share.connectRestart")}
          </button>
        </p>
      )}
      {step.kind === "post" && words.kind === "tooLong" && (
        <p className="text-xs text-pretty text-ink">
          {t("orgChart.share.tooLong", { count: words.over })}
        </p>
      )}
      {step.kind === "post" && (
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
      )}
    </div>
  );
}
