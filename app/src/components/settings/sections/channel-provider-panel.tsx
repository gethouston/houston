import type {
  ChannelConnection,
  ChannelProviderId,
} from "@houston/engine-adapter";
import { Button } from "@houston-ai/core";
import { Plus } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrgWriteLock } from "../../../hooks/use-org-write-lock";
import { ConnectionStatusBadge } from "../../integrations/connection-status-badge";
import { SettingsCard } from "../settings-row";
import { ChannelAccountList } from "./channel-account-list";
import type { ChannelCardState } from "./channel-provider-cards";
import { CHANNEL_PROVIDER_DISPLAY } from "./channel-provider-display";

/**
 * One messaging provider's card: its mark, whether it is connected, the
 * accounts it holds, and the way to connect one more. `children` is the
 * provider's own connect flow (Slack's hand-off, WhatsApp's code), shown only
 * while the provider can connect. The heading takes focus when a disconnect
 * removes the row whose button opened the confirmation. A locked org
 * connects nothing new but still disconnects.
 */
export function ChannelProviderPanel({
  provider,
  name,
  state,
  busy,
  actionLabel,
  onConnect,
  onDisconnect,
  headingRef,
  children,
}: {
  provider: ChannelProviderId;
  name: string;
  state: ChannelCardState;
  busy: boolean;
  /** Replaces the connect and add labels while the provider's flow is mid-way. */
  actionLabel?: string;
  onConnect: () => void;
  onDisconnect: (connection: ChannelConnection) => void;
  headingRef: Ref<HTMLHeadingElement>;
  children?: ReactNode;
}) {
  const { t } = useTranslation("settings");
  const { locked } = useOrgWriteLock();
  const display = CHANNEL_PROVIDER_DISPLAY[provider];
  const headingId = useId();
  const connections = state.kind === "empty" ? [] : state.connections;
  const [seenIds] = useState(() => new Set(connections.map((c) => c.id)));
  // After commit, so every row that rendered this pass read the set first.
  useEffect(() => {
    for (const connection of connections) seenIds.add(connection.id);
  }, [connections, seenIds]);
  return (
    <SettingsCard>
      <section aria-labelledby={headingId} className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <img
            src={display.logo}
            alt=""
            className="size-10 shrink-0 rounded-lg object-contain"
          />
          <div className="min-w-0 flex-1">
            <h3
              ref={headingRef}
              id={headingId}
              tabIndex={-1}
              className="rounded-sm text-sm font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {name}
            </h3>
            {state.kind === "connected" && (
              <ConnectionStatusBadge status="active" />
            )}
            <p className="text-sm text-ink-muted">{t(display.description)}</p>
          </div>
        </div>
        {connections.length > 0 && (
          <ChannelAccountList
            title={t(display.accountsTitle)}
            connections={connections}
            seenIds={seenIds}
            busy={busy}
            addLabel={
              state.kind === "connected" && !locked
                ? (actionLabel ?? t(display.addAnother))
                : undefined
            }
            onAdd={onConnect}
            onDisconnect={onDisconnect}
          />
        )}
        {state.kind === "empty" && (
          <Button disabled={busy || locked} onClick={onConnect}>
            <Plus className="size-4" />
            {actionLabel ?? t(display.connect)}
          </Button>
        )}
        {state.kind === "unavailable" ? (
          <p role="status" className="text-sm text-ink-muted">
            {t(display.notConfigured)}
          </p>
        ) : (
          <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">
            {children}
          </fieldset>
        )}
      </section>
    </SettingsCard>
  );
}
