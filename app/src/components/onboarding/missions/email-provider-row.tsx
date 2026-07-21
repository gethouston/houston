import { Button } from "@houston-ai/core";
import { Check, Loader2 } from "lucide-react";
import type { AppDisplay } from "../../integrations/app-display";
import { AppRow } from "../../integrations/app-row";

interface EmailProviderRowProps {
  /** Real app identity (logo + name), resolved from the toolkit catalog. */
  display: AppDisplay;
  /** This toolkit is connected and active. */
  connected: boolean;
  /** This row's OAuth connect is in flight. */
  loading: boolean;
  /** Another row's connect is in flight: this row's Connect is inert (the step
   *  connects one email provider at a time by design). */
  disabled: boolean;
  labels: {
    connect: string;
    connecting: string;
    cancel: string;
    connected: string;
  };
  onConnect: () => void;
  onCancel: () => void;
}

/**
 * An email provider row rendered in the shared integrations look: the real app
 * logo + name (`AppRow`) with a trailing rounded-full secondary Connect pill.
 * The three states mirror the integrations surfaces exactly (see
 * `cloud-migration/done-followups.tsx`):
 *  - idle: a secondary Connect pill; disabled while the other row connects.
 *  - in-flight: a live "Connecting" line with a per-row Cancel.
 *  - connected: a success check + label, so the row settles instead of offering
 *    a dead action.
 */
export function EmailProviderRow({
  display,
  connected,
  loading,
  disabled,
  labels,
  onConnect,
  onCancel,
}: EmailProviderRowProps) {
  return (
    <AppRow
      display={display}
      trailing={
        connected ? (
          <span className="inline-flex items-center gap-1.5 pr-1 text-xs font-medium text-success">
            <Check className="size-4" strokeWidth={2.5} />
            {labels.connected}
          </span>
        ) : loading ? (
          <span className="inline-flex items-center gap-2 pr-1 text-xs text-ink-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {labels.connecting}
            <button
              type="button"
              onClick={onCancel}
              className="font-medium text-ink underline-offset-2 transition-colors hover:underline"
            >
              {labels.cancel}
            </button>
          </span>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full"
            disabled={disabled}
            onClick={onConnect}
          >
            {labels.connect}
          </Button>
        )
      }
    />
  );
}
