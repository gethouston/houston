/**
 * Background right-click menu (New Folder), shared by both views. Closes on
 * outside click or Escape (the latter on the document — the portal never
 * holds focus).
 */
import { createPortal } from "react-dom";
import { useEscapeDismiss } from "./use-escape-dismiss";

export function BgContextMenu({
  position,
  label,
  onNewFolder,
  onClose,
}: {
  position: { x: number; y: number };
  label: string;
  onNewFolder: () => void;
  onClose: () => void;
}) {
  useEscapeDismiss(onClose);
  return createPortal(
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: full-screen backdrop that closes the context menu on pointer interaction; no keyboard role applies */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss is a pointer-only pattern; Escape is handled at the document level (useEscapeDismiss) */}
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-50 min-w-[160px] rounded-lg border border-line bg-popover py-1 shadow-lg"
        style={{ left: position.x, top: position.y }}
      >
        <button
          type="button"
          onClick={onNewFolder}
          className="mx-0.5 rounded-md px-3 py-1.5 text-left text-sm hover:bg-action hover:text-action-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          style={{ width: "calc(100% - 4px)" }}
        >
          {label}
        </button>
      </div>
    </>,
    document.body,
  );
}
