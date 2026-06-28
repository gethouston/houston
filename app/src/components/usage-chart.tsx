import { useEffect, useRef, useState } from "react";

// SVG layout constants
const VW = 480;
const VH = 160;
const PL = 42;  // left padding for Y labels
const PR = 8;
const PT = 12;
const PB = 28;
const CW = VW - PL - PR;
const CH = VH - PT - PB;

function fmtTick(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  if (v >= 1 && v < 1000) return v.toFixed(v < 10 ? 2 : 0);
  if (v > 0 && v < 1) return v.toFixed(4);
  return String(Math.round(v));
}

function niceMax(raw: number): number {
  if (raw === 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

function mk(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export interface BarChartProps {
  values: number[];
  xLabels: (string | null)[];
  tooltips: string[];
  caption?: string;
}

interface ChartColors {
  fg: string;
  muted: string;
  bg: string;
}

/** Read a computed color off a throwaway element carrying a Tailwind class, so
 *  we get the real themed token value rather than guessing a CSS variable name. */
function probeColor(className: string, prop: "color" | "backgroundColor"): string {
  const tmp = document.createElement("span");
  tmp.className = className;
  tmp.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(tmp);
  const value = getComputedStyle(tmp)[prop];
  document.body.removeChild(tmp);
  return value;
}

function readChartColors(container: HTMLElement | null): ChartColors {
  return {
    fg: getComputedStyle(container ?? document.body).color || "#000",
    muted: probeColor("text-muted-foreground", "color") || "#888",
    bg: probeColor("bg-background", "backgroundColor") || "#fff",
  };
}

export function BarChart({ values, xLabels, tooltips, caption }: BarChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [colors, setColors] = useState<ChartColors>({ fg: "#000", muted: "#888", bg: "#fff" });

  // Resolve themed colors on mount, and re-resolve when the theme toggles
  // (the app flips data-theme on <html>). Keeping colors in state means the
  // draw effect below redraws automatically on a live light/dark switch.
  useEffect(() => {
    setColors(readChartColors(containerRef.current));
    const observer = new MutationObserver(() => {
      setColors(readChartColors(containerRef.current));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    // Guard: svg may be removed from DOM during unmount before this effect runs
    if (!svg || !svg.isConnected) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const n = values.length;
    if (n === 0) return;

    const fgColor = colors.fg;
    const mutedColor = colors.muted;
    const rawMax = Math.max(...values, 0);
    const ticks = (() => {
      const nice = niceMax(rawMax);
      const step = nice / 4;
      return Array.from({ length: 5 }, (_, i) => i * step);
    })();
    const maxTick = ticks[ticks.length - 1];
    const toY = (v: number) => PT + (1 - v / maxTick) * CH;
    const gap = 2;
    const barW = Math.max(2, CW / n - gap);
    const toX = (i: number) => PL + (i / n) * CW + (CW / n - barW) / 2;

    // Y gridlines + labels
    for (const tick of ticks) {
      const y = toY(tick);
      svg.appendChild(mk("line", {
        x1: PL, y1: y, x2: PL + CW, y2: y,
        stroke: fgColor,
        "stroke-opacity": tick === 0 ? "0.12" : "0.06",
        "stroke-width": "1",
        "stroke-dasharray": tick === 0 ? "" : "3 3",
      }));
      const label = mk("text", {
        x: PL - 5, y, "text-anchor": "end", "dominant-baseline": "middle",
        "font-size": "9", fill: mutedColor,
      });
      label.textContent = fmtTick(tick);
      svg.appendChild(label);
    }

    // Bars
    for (let i = 0; i < n; i++) {
      const bx = toX(i);
      const barH = Math.max(0, (values[i] / maxTick) * CH);
      const by = toY(values[i]);
      const isHovered = hover === i;
      svg.appendChild(mk("rect", {
        x: bx, y: by, width: barW, height: barH,
        rx: Math.min(3, barW / 4),
        fill: fgColor,
        "fill-opacity": isHovered ? "0.85" : values[i] > 0 ? "0.5" : "0.1",
      }));
    }

    // X labels
    for (let i = 0; i < n; i++) {
      const lbl = xLabels[i];
      if (!lbl) continue;
      const cx = toX(i) + barW / 2;
      const t = mk("text", {
        x: cx, y: PT + CH + 14, "text-anchor": "middle",
        "font-size": "9", fill: mutedColor,
      });
      t.textContent = lbl;
      svg.appendChild(t);
    }

    // Hover tooltip
    if (hover !== null) {
      const bx = toX(hover);
      const cx = bx + barW / 2;
      const hy = toY(values[hover]);
      const tip = tooltips[hover];
      const bw = Math.max(tip.length * 5.6 + 16, 60);
      const bh = 20;
      const tx = Math.min(Math.max(cx - bw / 2, PL), PL + CW - bw);
      const ty = Math.max(hy - bh - 8, PT);
      svg.appendChild(mk("rect", {
        x: tx, y: ty, width: bw, height: bh, rx: "4",
        fill: fgColor, "fill-opacity": "0.9",
      }));
      const tipText = mk("text", {
        x: tx + bw / 2, y: ty + bh / 2,
        "text-anchor": "middle", "dominant-baseline": "middle",
        "font-size": "9.5", fill: colors.bg,
      });
      tipText.textContent = tip;
      svg.appendChild(tipText);
    }
    // Return cleanup: clear SVG children safely on unmount
    return () => {
      if (svg.isConnected) {
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, xLabels, tooltips, hover, colors]);

  return (
    <div ref={containerRef} className="space-y-1">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full"
        style={{ height: "148px" }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const svgX = ((e.clientX - rect.left) / rect.width) * VW;
          const plotX = svgX - PL;
          const idx = Math.floor((plotX / CW) * values.length);
          const clamped = Math.max(0, Math.min(values.length - 1, idx));
          setHover(plotX >= 0 && plotX <= CW ? clamped : null);
        }}
      />
      {caption && <p className="text-xs text-muted-foreground text-center">{caption}</p>}
    </div>
  );
}
