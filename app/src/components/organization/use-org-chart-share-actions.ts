import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { analytics } from "../../lib/analytics";
import { logAndReportError } from "../../lib/error-report";
import { openExternalUrl } from "../../lib/open-external-url";
import { saveBlob } from "../../lib/save-blob";
import {
  isShareCancel,
  type ShareChannel,
  shareAbilities,
} from "./org-chart-share-model";
import {
  isExpectedClipboardRefusal,
  shareToLinkedIn,
} from "./org-chart-share-run";
import type { OrgTree } from "./org-chart-tree";
import type { ShareImage } from "./use-share-card-image";

/** How long a button says "Copied" or "Saved" before it reads normally. */
const DONE_MS = 2000;

/** Counts only: no names ride a share event. */
function track(channel: ShareChannel, tree: OrgTree) {
  analytics.track("org_chart_shared", {
    share_channel: channel,
    agent_count: tree.counts.agents,
    people_count: tree.counts.people,
  });
}

/**
 * The share dialog's actions over the drawn image and the post text.
 * Unexpected failures report and change nothing on screen (the error
 * surfacing rule); a person closing the native share sheet is not one.
 * `done` names the action that just landed so its button can say so.
 */
export function useOrgChartShareActions(
  tree: OrgTree,
  image: ShareImage,
  post: string,
) {
  const [done, setDone] = useState<ShareChannel | null>(null);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const landed = (channel: ShareChannel) => {
    track(channel, tree);
    setDone(channel);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(null), DONE_MS);
  };
  const ready = image.status === "ready" ? image : null;
  const abilities = shareAbilities(
    {
      clipboard: navigator.clipboard ?? undefined,
      ClipboardItem: globalThis.ClipboardItem,
      share: navigator.share,
      canShare: navigator.canShare?.bind(navigator),
    },
    ready?.file ?? null,
  );

  const linkedIn = async () => {
    // No await before this call: the open must stay inside the click.
    const result = await shareToLinkedIn(post, {
      writeText: navigator.clipboard?.writeText?.bind(navigator.clipboard),
      open: openExternalUrl,
      report: logAndReportError,
    });
    // A blocked tab gets a real link to click; the desktop shell has no
    // popup blocker, so there a refusal is already explained by its toast.
    setBlockedUrl(result.opened || isTauri() ? null : result.url);
    if (result.opened) landed("linkedin");
  };

  const download = async () => {
    if (!ready) return;
    try {
      const saved = await saveBlob(ready.file.name, ready.blob);
      if (saved.kind === "saved") landed("download");
    } catch (error) {
      logAndReportError("org_chart_share_download", error);
    }
  };

  const copyImage = async () => {
    if (!ready) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": ready.blob }),
      ]);
      landed("copy_image");
    } catch (error) {
      if (!isExpectedClipboardRefusal(error))
        logAndReportError("org_chart_share_copy_image", error);
    }
  };

  const nativeShare = async () => {
    if (!ready) return;
    try {
      await navigator.share({ files: [ready.file], text: post });
      landed("native");
    } catch (error) {
      if (!isShareCancel(error))
        logAndReportError("org_chart_share_native", error);
    }
  };

  return {
    abilities,
    done,
    /** LinkedIn's link, when the browser blocked the tab it tried to open. */
    blockedUrl,
    linkedIn,
    download,
    copyImage,
    nativeShare,
  };
}
