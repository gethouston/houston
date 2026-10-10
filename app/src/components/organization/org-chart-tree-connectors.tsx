import { cn } from "@houston-ai/core";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import {
  type Box,
  connectorPath,
  type Edge,
  type PathOptions,
} from "./org-chart-tree-paths";
import { useRevealOnce } from "./use-reveal-once";

/**
 * The chart's frame: its nodes, and its lines drawn under them from where
 * the nodes actually landed, measured after layout and again whenever the
 * frame resizes (a name that wraps, a window that narrows), so a line always
 * meets its node. The frame owns the element it measures: a child's layout
 * effect runs before its parent's ref is attached, so the lines cannot be
 * measured from a ref the parent holds. The cards' one-time reveal runs
 * here too, for the same reason.
 */
export function OrgChartTreeFrame({
  edges,
  options,
  className,
  children,
}: {
  edges: readonly Edge[];
  options: PathOptions;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState("");
  useRevealOnce(ref);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const draw = () =>
      setPath(connectorPath(edges, layoutBoxes(root), options));
    draw();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(draw);
    observer.observe(root);
    return () => observer.disconnect();
  }, [edges, options]);
  return (
    <div ref={ref} className={cn("relative", className)}>
      <svg
        aria-hidden="true"
        data-reveal-lines=""
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
      >
        <path
          d={path}
          fill="none"
          className="stroke-line-input"
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {children}
    </div>
  );
}

/**
 * Boxes without the reveal's in-flight transform: `offsetLeft`/`offsetTop`
 * ignore transforms, so lines measured mid-reveal still land where the
 * nodes come to rest.
 */
function layoutBoxes(root: HTMLElement): Map<string, Box> {
  const boxes = new Map<string, Box>();
  for (const node of root.querySelectorAll<HTMLElement>("[data-tree-node]")) {
    const id = node.dataset.treeNode;
    if (!id) continue;
    let x = 0;
    let y = 0;
    let el: HTMLElement | null = node;
    while (el && el !== root) {
      x += el.offsetLeft;
      y += el.offsetTop;
      el = el.offsetParent as HTMLElement | null;
    }
    if (el === root)
      boxes.set(id, { x, y, w: node.offsetWidth, h: node.offsetHeight });
  }
  return boxes;
}
