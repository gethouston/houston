import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { logAndReportError } from "../../lib/error-report";
import { renderShareCard } from "./org-chart-share-card";
import type { ShareCardText } from "./org-chart-share-card-paint";
import {
  currentShareImage,
  type DrawnShareImage,
  type ShareImage,
} from "./org-chart-share-image-state";
import { shareFileName, shareTitle } from "./org-chart-share-model";
import type { OrgTree } from "./org-chart-tree";

export type { ShareImage };

/**
 * The share PNG for `tree`, drawn while `open` and released when the dialog
 * closes. A draw that fails reports and settles on `failed` with a retry; a
 * draw that lands after the dialog closed or the tree changed is dropped.
 */
export function useShareCardImage(tree: OrgTree, open: boolean) {
  const { t } = useTranslation("teams");
  const [drawn, setDrawn] = useState<DrawnShareImage | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let live = true;
    let url: string | null = null;
    const settle = (image: ShareImage) => {
      if (live) setDrawn({ tree, attempt, image });
    };
    const title = shareTitle(tree);
    const agents = t("orgChart.agentCount", { count: tree.counts.agents });
    const text: ShareCardText = {
      kicker: t("orgChart.share.cardKicker"),
      title,
      counts:
        tree.root.kind === "person"
          ? agents
          : t("orgChart.share.cardCounts", {
              people: t("orgChart.peopleCount", { count: tree.counts.people }),
              agents,
            }),
      brand: t("orgChart.share.brand"),
      site: t("orgChart.share.site"),
      more: (count) => t("orgChart.more", { count }),
    };
    renderShareCard(tree, text, {
      role: (person) => t(`people.roles.${person.role}`),
      people: (count) => t("orgChart.peopleCount", { count }),
      agents: (count) => t("orgChart.agentCount", { count }),
    })
      .then((blob) => {
        if (!live) return;
        url = URL.createObjectURL(blob);
        const file = new File([blob], shareFileName(title), {
          type: "image/png",
        });
        settle({ status: "ready", blob, url, file });
      })
      .catch((error: unknown) => {
        logAndReportError("org_chart_share_image", error);
        settle({ status: "failed" });
      });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
      setDrawn(null);
    };
  }, [tree, open, attempt, t]);

  return {
    image: currentShareImage(drawn, tree, attempt, open),
    retry: () => setAttempt((n) => n + 1),
  };
}
