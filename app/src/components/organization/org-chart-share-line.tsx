import {
  LINKEDIN_FEED_URL,
  linkedInRetryMinutes,
} from "@houston/sdk/linkedin/policy";
import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { FallbackLink } from "../shell/fallback-link";
import type { ShareLine } from "./org-chart-share-run";

/** A rate limit names its wait when the gateway said how long. */
function useLineText(line: ShareLine | null): string | null {
  const { t } = useTranslation("teams");
  if (!line || line.kind === "blocked") return null;
  const minutes =
    line.kind === "wait" ? linkedInRetryMinutes(line.retryAfterMs) : null;
  return minutes === null
    ? t(LINE_KEY[line.kind])
    : t("orgChart.share.rateLimitedIn", { count: minutes });
}

/**
 * The one line under the share dialog's buttons (`ShareLine`). Always
 * mounted, so a screen reader announces it when it arrives; only its words
 * change. Empty, it is sr-only, which takes it out of the layout without
 * hiding it.
 */
export function ShareStatusLine({
  line,
  onFollowBlocked,
  onDismissUnconfirmed,
}: {
  line: ShareLine | null;
  onFollowBlocked: () => void;
  /** The person checked LinkedIn: Post comes back. */
  onDismissUnconfirmed: () => void;
}) {
  const { t } = useTranslation("teams");
  const text = useLineText(line);
  return (
    <p
      role="status"
      className={cn("text-sm text-pretty text-ink", !line && "sr-only")}
    >
      {text}
      {line?.kind === "blocked" && (
        <>
          {line.image && `${t(LINE_KEY[line.image])} `}
          {t("orgChart.share.linkedInBlocked")}{" "}
          <a
            href={line.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onFollowBlocked}
            className="font-medium text-link underline underline-offset-2"
          >
            {t("orgChart.share.openLinkedIn")}
          </a>
        </>
      )}
      {line?.kind === "unconfirmed" && (
        <>
          {" "}
          <FallbackLink
            href={LINKEDIN_FEED_URL}
            command="linkedin_open_feed"
            className="font-medium"
          >
            {t("orgChart.share.openLinkedIn")}
          </FallbackLink>
          <span aria-hidden> · </span>
          <button
            type="button"
            onClick={onDismissUnconfirmed}
            className="rounded-sm font-medium text-ink underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {t("orgChart.share.unconfirmedDismiss")}
          </button>
        </>
      )}
    </p>
  );
}

const LINE_KEY = {
  copied: "orgChart.share.copied",
  saved: "orgChart.share.saved",
  reconnect: "orgChart.share.reconnect",
  wait: "orgChart.share.rateLimited",
  retry: "orgChart.share.postFailed",
  posted: "orgChart.share.posted",
  unconfirmed: "orgChart.share.unconfirmed",
} as const satisfies Record<Exclude<ShareLine["kind"], "blocked">, string>;
