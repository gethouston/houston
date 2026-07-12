import { Spinner } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { type AppDisplay, AppLogo } from "../integrations";

/**
 * One flat category row on the browse plane — the reference's GitHub-row look:
 * large brand icon, name over a single muted line of description, and a quiet
 * trailing `+`. The WHOLE row is the button (a generous hit target), transparent
 * at rest with the hover fill (`bg-hover`) sweeping the full row — no bordered
 * card, no chip. While THIS app connects it shows a spinner; while ANOTHER
 * connect is in flight the row is inert (`busy`) but deliberately does NOT look
 * disabled (`disabled:opacity-100`), keeping the plane calm rather than greying
 * out. The tradeoff: a calm inert row could still invite a click, so while busy
 * it drops its hover fill and pointer (`disabled:hover:bg-transparent`,
 * `disabled:cursor-default`) so the no-op reads as intentionally quiet, not
 * broken. Its accessible name is its text content (name + description) — no
 * invented aria-label.
 */
export function PlaneAppRow({
  display,
  onConnect,
  connecting,
  busy,
}: {
  display: AppDisplay;
  onConnect: () => void;
  connecting: boolean;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onConnect}
      disabled={busy && !connecting}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 disabled:opacity-100 disabled:cursor-default disabled:hover:bg-transparent"
    >
      <AppLogo display={display} size="lg" className="rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{display.name}</p>
        {display.description && (
          <p className="truncate text-[13px] text-ink-muted">
            {display.description}
          </p>
        )}
      </div>
      {connecting ? (
        <Spinner className="size-4 text-ink-muted" />
      ) : (
        <Plus className="size-4 shrink-0 text-ink-muted/70" aria-hidden />
      )}
    </button>
  );
}
