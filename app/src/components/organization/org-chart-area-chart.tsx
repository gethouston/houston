import { cn } from "@houston-ai/core";
import { useId, useRef } from "react";
import { areaChart } from "./org-chart-format";
import { useElementSize } from "./use-element-size";

export function OrgChartAreaDrawing({
  values,
  label,
  width,
  height,
}: {
  values: readonly number[];
  label: string;
  width: number;
  height: number;
}) {
  const fade = `area${useId().replace(/[^\w-]/g, "")}`;
  const geometry = areaChart(values, width, height);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      role="img"
      aria-label={label}
      className="block"
    >
      <defs>
        <linearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1="0"
        y1={geometry.base}
        x2={width}
        y2={geometry.base}
        className="stroke-line"
      />
      <polygon points={geometry.area} fill={`url(#${fade})`} />
      <polyline
        points={geometry.line}
        stroke="currentColor"
        strokeOpacity="0.75"
        vectorEffect="non-scaling-stroke"
        className="stroke-1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={geometry.end.x}
        cy={geometry.end.y}
        r="3"
        fill="currentColor"
      />
    </svg>
  );
}

export function OrgChartAreaChart({
  values,
  label,
  from,
  to,
  className,
}: {
  values: readonly number[];
  label: string;
  from: string;
  to: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(box);
  return (
    <figure className="m-0 flex w-full flex-col gap-2">
      <div ref={box} className={cn("w-full text-ink", className)}>
        {width > 0 && height > 0 && (
          <OrgChartAreaDrawing
            values={values}
            label={label}
            width={width}
            height={height}
          />
        )}
      </div>
      <figcaption className="flex justify-between text-xs text-ink-muted tabular-nums">
        <span>{from}</span>
        <span>{to}</span>
      </figcaption>
    </figure>
  );
}
