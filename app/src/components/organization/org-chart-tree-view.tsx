import { Button } from "@houston-ai/core";
import { Share2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CAPTION } from "./org-chart-caption";
import { PRESS_CLASS, PRESS_STYLE } from "./org-chart-motion";
import type { OrgTree } from "./org-chart-tree";
import { OrgChartTreeFrame } from "./org-chart-tree-connectors";
import { type TreeHandlers, useTreeParts } from "./org-chart-tree-levels";
import { type PathOptions, treeEdges } from "./org-chart-tree-paths";
import { useCentreOnce } from "./use-centre-once";

/**
 * Lines meet a card's avatar on the phone: the card's `px-3` plus half its
 * `size-8` avatar. Corners round at 8, like the cards they join.
 */
const PATHS: PathOptions = { radius: 8, spineInset: 28 };

interface TreeViewProps extends TreeHandlers {
  tree: OrgTree;
  /** The phone's outline instead of the desktop's top-down chart. */
  phone: boolean;
  onShare: () => void;
}

/**
 * The org chart drawn as one: the space at the top, its people under it,
 * each person's AI Employees under them, joined by lines measured from where
 * the cards landed. Desktop reads top-down and scrolls sideways when wide
 * (centred when it fits); the phone reads it as an indented outline. The
 * cards fade up once when the chart first mounts.
 */
export function OrgChartTreeView({
  tree,
  phone,
  onShare,
  ...handlers
}: TreeViewProps) {
  const { t } = useTranslation("teams");
  const { root, columns } = useTreeParts(tree, handlers);
  // A chart wider than the screen opens on its root, not its left edge.
  const scroller = useCentreOnce<HTMLDivElement>();
  const edges = useMemo(
    () => treeEdges(tree, phone ? "phone" : "desktop"),
    [tree, phone],
  );

  return (
    <section
      aria-label={t("orgChart.tree.label")}
      data-org-tree=""
      className="flex flex-col gap-5 md:gap-6"
    >
      <div className="flex items-center justify-between gap-4">
        <h3 className={CAPTION}>{t("orgChart.tree.title")}</h3>
        <Button
          variant="outline"
          className={`rounded-full ${PRESS_CLASS}`}
          style={PRESS_STYLE}
          onClick={onShare}
        >
          <Share2 className="size-4" />
          {t("orgChart.share.open")}
        </Button>
      </div>
      {phone ? (
        <OrgChartTreeFrame edges={edges} options={PATHS}>
          {root}
          {columns.length > 0 && (
            <ul className="flex flex-col gap-3 pt-3 pl-10">
              {columns.map((column) => (
                <li key={column.key} className="flex flex-col gap-3">
                  {column.head}
                  {column.stack.length > 0 && (
                    <ul className="flex flex-col gap-3 pl-10">
                      {column.stack.map((item) => (
                        <li key={item.key}>{item.node}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </OrgChartTreeFrame>
      ) : (
        <div ref={scroller} className="-mx-2 overflow-x-auto px-2 pt-1 pb-3">
          <OrgChartTreeFrame
            edges={edges}
            options={PATHS}
            className="mx-auto w-max min-w-full"
          >
            <div className="flex flex-col items-center">
              <div className="w-56">{root}</div>
              {columns.length > 0 && (
                <ul className="mt-12 flex items-start gap-4">
                  {columns.map((column) => (
                    <li key={column.key} className="flex w-56 flex-col gap-6">
                      {column.head}
                      {column.stack.length > 0 && (
                        <ul className="flex flex-col gap-4">
                          {column.stack.map((item) => (
                            <li key={item.key}>{item.node}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </OrgChartTreeFrame>
        </div>
      )}
    </section>
  );
}
