import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { logAndReportError } from "../../lib/error-report";
import { openExternalUrl } from "../../lib/open-external-url";
import {
  canCopyImage,
  copyImageToClipboard,
  downloadShareImage,
  pasteDeps,
} from "./org-chart-share-browser";
import { createLinkedInGate } from "./org-chart-share-gate";
import { shareAltText, sharePostText } from "./org-chart-share-model";
import { shareByPaste } from "./org-chart-share-paste";
import { type ShareLanding, shareViaSheet } from "./org-chart-share-run";
import {
  INITIAL_SHARE_DIALOG,
  replacesShownImage,
  shareDialogReducer,
} from "./org-chart-share-state";
import { shareStep } from "./org-chart-share-step";
import { shareCounts, trackShare as track } from "./org-chart-share-track";
import type { OrgTree } from "./org-chart-tree";
import { useLinkedInPost } from "./use-linkedin-post";
import { useShareCardImage } from "./use-share-card-image";
import { useShareRoute } from "./use-share-route";

/** How long Copy image reads "Copied". */
const COPIED_MS = 2000;

/**
 * The share dialog's state and actions over the image drawn ahead
 * (`useShareCardImage`): the editable post, the one primary button
 * (`shareStep`: share sheet, copy and paste, or Connect then Post to
 * LinkedIn through `useLinkedInPost`), Download image and Copy image. The
 * share sheet and copy and paste do their work inside the click (a browser
 * grants the clipboard and LinkedIn's tab only there); copy and paste is
 * gated, since a double click would open LinkedIn twice. Unexpected failures
 * report and show nothing.
 */
export function useOrgChartShare(tree: OrgTree) {
  const { t } = useTranslation("teams");
  const { preview, file, retry, current } = useShareCardImage(tree);
  const [gate] = useState(() => createLinkedInGate(() => performance.now()));
  const [state, dispatch] = useReducer(
    shareDialogReducer,
    INITIAL_SHARE_DIALOG,
  );
  const session = useRef(state.session);
  session.current = state.session;
  const live = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  // Only replacing a picture that was on screen resets: the first image
  // arriving must not wipe the line of a share started while it drew.
  const drawnUrl = preview.status === "ready" ? preview.url : null;
  const shownUrl = useRef<string | null>(null);
  useEffect(() => {
    const previous = shownUrl.current;
    shownUrl.current = drawnUrl;
    if (!replacesShownImage(previous, drawnUrl)) return;
    clearTimer();
    dispatch({ type: "redrawn", url: drawnUrl });
  }, [drawnUrl, clearTimer]);

  const route = useShareRoute(file);
  const linkedIn = useLinkedInPost({
    enabled: state.open && route.kind === "post",
    state,
    dispatch,
    session,
    onPosted: () => track("linkedin_post", tree),
  });
  const step = shareStep({
    route: route.kind,
    connection: linkedIn.connection,
    connecting: linkedIn.connectPhase,
    posting: linkedIn.posting,
    postUrl: state.postUrl,
  });
  const text = state.text ?? sharePostText(t, tree);

  const setOpen = (next: boolean) => {
    if (next) {
      analytics.track("org_chart_share_opened", shareCounts(tree));
      clearTimer();
    }
    dispatch({ type: next ? "open" : "close" });
  };

  /** Lands a click made in `started`: tracked always, said only there. */
  const land = (landing: ShareLanding, started: number) => {
    if (landing.channel) track(landing.channel, tree);
    if (live.current)
      dispatch({ type: "landed", session: started, line: landing.line });
  };

  // Nothing is awaited before the share starts: the clipboard write and the
  // open must stay inside the click.
  const share = () => {
    const started = session.current;
    const fail = (error: unknown) =>
      logAndReportError("org_chart_share", error);
    try {
      if (route.kind === "sheet") {
        if (file)
          void shareViaSheet(route.sheet, file, text, logAndReportError)
            .then((landing) => land(landing, started))
            .catch(fail);
        return;
      }
      gate(() =>
        shareByPaste(pasteDeps(text, current().png, isTauri()))
          .then((landing) => land(landing, started))
          .catch(fail),
      );
    } catch (error) {
      fail(error);
    }
  };

  // The write takes the image as a promise and starts in the click's tick.
  const copyImage = () => {
    copyImageToClipboard(current().png)
      .then((copied) => {
        if (!copied) return;
        track("copy_image", tree);
        if (!live.current) return;
        dispatch({ type: "copied" });
        clearTimer();
        timer.current = setTimeout(
          () => dispatch({ type: "copiedDone" }),
          COPIED_MS,
        );
      })
      .catch((error: unknown) =>
        logAndReportError("org_chart_share_copy_image", error),
      );
  };

  const line = state.line;
  return {
    open: state.open,
    setOpen,
    preview,
    retry: () => void retry(),
    ready: file !== null,
    text,
    setText: (next: string) => dispatch({ type: "edited", text: next }),
    step,
    line,
    share,
    connect: linkedIn.connect,
    post: () => {
      if (file) void linkedIn.post(file, text, shareAltText(t, tree));
    },
    postHeld: linkedIn.held,
    dismissUnconfirmed: linkedIn.dismissUnconfirmed,
    viewPost: (url: string) =>
      void openExternalUrl(url, { command: "linkedin_view_post" }),
    disconnect: linkedIn.disconnect,
    disconnecting: linkedIn.disconnecting,
    followBlocked: () => {
      if (line?.kind === "blocked" && line.channel) track(line.channel, tree);
    },
    download: () =>
      void downloadShareImage(current()).then((saved) => {
        if (saved) track("download", tree);
      }),
    canCopy: canCopyImage(),
    copied: state.copied,
    copyImage,
  };
}
