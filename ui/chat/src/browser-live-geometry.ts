import type { BrowserLiveViewInput } from "./browser-live-types";

export interface BrowserLiveWheelSample {
  clientX: number;
  clientY: number;
  deltaX: number;
  deltaY: number;
  deltaMode: number;
}

export interface BrowserLiveStageGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  frameWidth: number;
}

const LINE_PX = 16;
const PAGE_PX = 800;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizedPoint(
  clientX: number,
  clientY: number,
  geo: BrowserLiveStageGeometry,
): { x: number; y: number } {
  if (geo.width <= 0 || geo.height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp01((clientX - geo.left) / geo.width),
    y: clamp01((clientY - geo.top) / geo.height),
  };
}

export function pageScale(geo: BrowserLiveStageGeometry): number {
  return geo.width > 0 && geo.frameWidth > 0 ? geo.frameWidth / geo.width : 1;
}

export function wheelInput(
  sample: BrowserLiveWheelSample,
  geo: BrowserLiveStageGeometry,
): BrowserLiveViewInput {
  const k =
    sample.deltaMode === 1 ? LINE_PX : sample.deltaMode === 2 ? PAGE_PX : 1;
  return {
    type: "wheel",
    ...normalizedPoint(sample.clientX, sample.clientY, geo),
    dx: sample.deltaX * k,
    dy: sample.deltaY * k,
  };
}
