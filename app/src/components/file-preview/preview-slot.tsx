import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";
import type { FilePreviewTarget } from "../../stores/ui/types";
import { FilePreviewPanel } from "./file-preview-panel";

const SIDE_MIN = 360;
const PANEL_MIN = 400;
const GAP = 8;

function usePresence(value: FilePreviewTarget | null, exitMs: number) {
  const [last, setLast] = useState(value);
  const keyboard = useRef(false);
  if (value && value !== last) setLast(value);
  useEffect(() => {
    const onKey = () => {
      keyboard.current = true;
    };
    const onPointer = () => {
      keyboard.current = false;
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
  useEffect(() => {
    if (value || !last) return;
    const id = setTimeout(() => setLast(null), keyboard.current ? 0 : exitMs);
    return () => clearTimeout(id);
  }, [value, last, exitMs]);
  const leaving = !value && last !== null;
  return {
    shown: value ?? last,
    leaving,
    instant: leaving && keyboard.current,
  };
}

function useNarrow(row: HTMLElement | null): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (!row) return;
    const observer = new ResizeObserver(() =>
      setNarrow(row.clientWidth < SIDE_MIN + GAP + PANEL_MIN),
    );
    observer.observe(row);
    return () => observer.disconnect();
  }, [row]);
  return narrow;
}

export function useFilePreviewSlot() {
  const target = useUIStore((s) => s.filePreview);
  const expandedPref = useUIStore((s) => s.previewExpanded);
  const share = useUIStore((s) => s.previewWidth);
  const [row, setRow] = useState<HTMLDivElement | null>(null);
  const narrow = useNarrow(row);
  const { shown, leaving, instant } = usePresence(target, 200);
  const open = shown !== null;
  const expanded = open && (expandedPref || narrow);
  const slot = shown && (
    <>
      {!expanded && <PreviewGrip share={share} />}
      <FilePreviewPanel
        target={shown}
        leaving={leaving && !instant}
        expanded={expanded}
        canExpand={!narrow}
        width={`clamp(${PANEL_MIN}px, ${share * 100}%, calc(100% - ${SIDE_MIN + GAP}px))`}
      />
    </>
  );
  return { rowRef: setRow, open, expanded, slot };
}

function PreviewGrip({ share }: { share: number }) {
  const { t } = useTranslation("agents");
  const setShare = useUIStore((s) => s.setPreviewWidth);
  const start = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const parts = (grip: HTMLElement) => ({
    row: grip.parentElement as HTMLElement,
    panel: grip.nextElementSibling as HTMLElement,
  });
  const clamp = (row: HTMLElement, width: number) =>
    Math.max(PANEL_MIN, Math.min(width, row.clientWidth - SIDE_MIN - GAP));
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    const { row, panel } = parts(e.currentTarget);
    setShare(panel.offsetWidth / row.clientWidth);
    panel.style.width = "";
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable splitter has no element of its own
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={t("files.preview.resize")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(share * 100)}
      data-dragging={dragging ? "true" : undefined}
      className="preview-grip -mx-2 hidden w-2 shrink-0 cursor-col-resize touch-none place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus md:grid"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = {
          x: e.clientX,
          width: parts(e.currentTarget).panel.offsetWidth,
        };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const { row, panel } = parts(e.currentTarget);
        const width = start.current.width - (e.clientX - start.current.x);
        panel.style.width = `${clamp(row, width)}px`;
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        const step =
          e.key === "ArrowLeft" ? 24 : e.key === "ArrowRight" ? -24 : 0;
        if (!step) return;
        e.preventDefault();
        const { row, panel } = parts(e.currentTarget);
        setShare(clamp(row, panel.offsetWidth + step) / row.clientWidth);
      }}
    />
  );
}
