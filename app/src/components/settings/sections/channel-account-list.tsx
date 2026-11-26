import { cn } from "@houston-ai/core";
import type { ChannelConnection } from "@houston/engine-adapter";
import { Plus, Unplug } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * The accounts one provider holds, in the integrations accounts-list frame:
 * each row names its account and carries its own disconnect, and the foot row
 * connects another. A row whose id the card has never shown fades in, so a
 * connection finished in Slack or on a phone is noticed.
 */
export function ChannelAccountList({
  title,
  connections,
  seenIds,
  busy,
  addLabel,
  onAdd,
  onDisconnect,
}: {
  title: string;
  connections: ChannelConnection[];
  /** Every id the card has shown before this render. */
  seenIds: ReadonlySet<string>;
  busy: boolean;
  /** Absent: the provider cannot connect more, so the list has no foot row. */
  addLabel?: string;
  onAdd: () => void;
  onDisconnect: (connection: ChannelConnection) => void;
}) {
  const titleId = useId();
  return (
    <div>
      <h4 id={titleId} className="mb-1.5 text-sm font-medium text-ink">
        {title}
      </h4>
      <ul
        aria-labelledby={titleId}
        className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-input"
      >
        {connections.map((connection) => (
          <ChannelAccountRow
            key={connection.id}
            connection={connection}
            seenIds={seenIds}
            busy={busy}
            onDisconnect={onDisconnect}
          />
        ))}
        {addLabel && (
          <li>
            <button
              type="button"
              disabled={busy}
              onClick={onAdd}
              className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-ink outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset active:bg-hover disabled:pointer-events-none disabled:opacity-50 md:min-h-10"
            >
              <Plus className="size-4 shrink-0" />
              {addLabel}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

function ChannelAccountRow({
  connection,
  seenIds,
  busy,
  onDisconnect,
}: {
  connection: ChannelConnection;
  seenIds: ReadonlySet<string>;
  busy: boolean;
  onDisconnect: (connection: ChannelConnection) => void;
}) {
  const { t } = useTranslation("settings");
  // Decided once per mount: a re-render mid-entrance keeps the class, and a
  // row restored after a refused disconnect was already seen, so stays still.
  const [landing] = useState(() => !seenIds.has(connection.id));
  return (
    <li
      className={cn(
        "flex min-h-11 items-center gap-2 pr-1 pl-3 md:min-h-10 md:py-1",
        landing && "row-land-in",
      )}
    >
      <span className="min-w-0 flex-1 truncate text-sm text-ink">
        {connection.accountLabel}
      </span>
      <button
        type="button"
        aria-label={t("channels.disconnectAccount", {
          name: connection.accountLabel,
        })}
        disabled={busy}
        onClick={() => onDisconnect(connection)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-danger-ink outline-none transition-[background-color,scale] hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-focus active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 md:size-8"
      >
        <Unplug className="size-4" />
      </button>
    </li>
  );
}
