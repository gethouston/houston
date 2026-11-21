import { cn } from "@houston-ai/core";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import {
  type Box,
  connectorPath,
  type Edge,
  type PathOptions,
} from "./org-chart-tree-paths";
import { useRevealOnce } from "./use-reveal-once";

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
