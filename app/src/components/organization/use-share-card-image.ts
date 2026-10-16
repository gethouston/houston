import { useCallback, useEffect, useReducer, useRef } from "react";
import { useTranslation } from "react-i18next";
import { logAndReportError } from "../../lib/error-report";
import { renderShareCard } from "./org-chart-share-card";
import type { ShareCardText } from "./org-chart-share-card-paint";
import type { CardWords } from "./org-chart-share-columns";
import { shareFileName, shareTitle } from "./org-chart-share-model";
import type { OrgTree } from "./org-chart-tree";

export type Translate = ReturnType<typeof useTranslation<"teams">>["t"];

/** One drawing of the share PNG. `ready` and `url` are set once it lands. */
export interface ShareImageDraw {
  png: Promise<File>;
  ready: File | null;
  /** An object URL of the PNG for the preview, revoked when replaced. */
  url: string | null;
  failed: boolean;
  /** Replaced by a newer drawing: it never makes an object URL. */
  stale: boolean;
}

/** What the dialog's preview shows. */
export type SharePreview =
  | { status: "drawing" }
  | { status: "failed" }
  | { status: "ready"; url: string };

/** The words on the share image and the link card, all authored copy. */
export function shareCardText(tree: OrgTree, t: Translate): ShareCardText {
  const agents = t("orgChart.agentCount", { count: tree.counts.agents });
  return {
    title: shareTitle(tree),
    counts:
      tree.root.kind === "person"
        ? agents
        : t("orgChart.share.cardCounts", {
            people: t("orgChart.peopleCount", { count: tree.counts.people }),
            agents,
          }),
    site: t("orgChart.share.site"),
    more: (count) => t("orgChart.more", { count }),
  };
}

/** The words the layout writes on its "+N" cards. */
export function shareCardWords(t: Translate): CardWords {
  return {
    morePeople: (count) => t("orgChart.tree.morePeople", { count }),
    moreAgents: (count) => t("orgChart.tree.moreAgents", { count }),
  };
}

function draw(tree: OrgTree, t: Translate): ShareImageDraw {
  const text = shareCardText(tree, t);
  const entry: ShareImageDraw = {
    png: renderShareCard(tree, text, shareCardWords(t)).then(
      (blob) =>
        new File([blob], shareFileName(text.title), { type: "image/png" }),
    ),
    ready: null,
    url: null,
    failed: false,
    stale: false,
  };
  entry.png.then(
    (file) => {
      entry.ready = file;
      if (!entry.stale) entry.url = URL.createObjectURL(file);
    },
    (error: unknown) => {
      entry.failed = true;
      logAndReportError("org_chart_share_image", error);
    },
  );
  return entry;
}

function release(entry: ShareImageDraw | undefined) {
  if (!entry) return;
  entry.stale = true;
  if (entry.url) URL.revokeObjectURL(entry.url);
}

/**
 * The share PNG for `tree`, drawn ahead of the click: as soon as the chart
 * is on screen, and again whenever what it draws changes (`tree` keeps its
 * identity across identical reloads), so the dialog opens on a finished
 * image. `current()` is the latest drawing, still under way or done; one
 * that failed is drawn again on the next call or on `retry()`. `preview`
 * follows the latest drawing for the dialog.
 */
export function useShareCardImage(tree: OrgTree) {
  const { t } = useTranslation("teams");
  const latest = useRef<{ tree: OrgTree; draw: ShareImageDraw } | null>(null);
  const [, settled] = useReducer((n: number) => n + 1, 0);

  const start = useCallback((): ShareImageDraw => {
    release(latest.current?.draw);
    const entry = draw(tree, t);
    latest.current = { tree, draw: entry };
    const land = () => {
      if (latest.current?.draw === entry) settled();
    };
    entry.png.then(land, land);
    settled();
    return entry;
  }, [tree, t]);

  useEffect(() => {
    start();
    return () => {
      release(latest.current?.draw);
      latest.current = null;
    };
  }, [start]);

  const current = useCallback((): ShareImageDraw => {
    const held = latest.current;
    if (held && held.tree === tree && !held.draw.failed) return held.draw;
    return start();
  }, [tree, start]);

  const held = latest.current?.draw;
  const preview: SharePreview = !held
    ? { status: "drawing" }
    : held.failed
      ? { status: "failed" }
      : held.url
        ? { status: "ready", url: held.url }
        : { status: "drawing" };
  /** The drawn PNG, once the preview shows it. */
  const file = preview.status === "ready" ? (held?.ready ?? null) : null;
  return { current, preview, file, retry: start };
}
