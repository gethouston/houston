import { Button } from "@houston-ai/core";
import { Share2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PRESS_CLASS, PRESS_STYLE } from "./org-chart-motion";
import { edgeMask } from "./org-chart-scroll-edges";
import type { OrgTree } from "./org-chart-tree";
import { OrgChartTreeFrame } from "./org-chart-tree-connectors";
import { type TreeHandlers, useTreeParts } from "./org-chart-tree-levels";
import { type PathOptions, treeEdges } from "./org-chart-tree-paths";
import { useScrollEdges } from "./use-scroll-edges";

const PATHS: PathOptions = { radius: 8, spineInset: 28 };

interface TreeViewProps extends TreeHandlers {
  tree: OrgTree;
  phone: boolean;
  onShare: () => void;
}

export function OrgChartTreeView({
  tree,
  phone,
  onShare,
  ...handlers
}: TreeViewProps) {
  const { t } = useTranslation("teams");
  const { root, columns } = useTreeParts(tree, handlers);
  const scroller = useScrollEdges<HTMLDivElement>();
  const mask = edgeMask(scroller.edges);
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
      <div className="flex justify-end">
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
        <div
          ref={scroller.ref}
          className="-mx-2 overflow-x-auto px-2 pt-1 pb-3"
          style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        >
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
