import type { TriggerApp } from "@houston-ai/routines";
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { AppDisplay } from "../../integrations/app-display";
import { AppRow } from "../../integrations/app-row";
import type { ConnectableApp } from "../use-usable-toolkits";

const CONNECTABLE_CAP = 12;
const SEARCH_LIMIT = 30;

interface TriggerAppGridProps {
  connected: TriggerApp[];
  connectable: ConnectableApp[];
  query: string;
  onQueryChange: (q: string) => void;
  onSelectConnected: (app: TriggerApp) => void;
  onSelectConnectable: (app: ConnectableApp) => void;
}

function toDisplay(app: {
  toolkit: string;
  name: string;
  logoUrl?: string;
}): AppDisplay {
  return {
    toolkit: app.toolkit,
    name: app.name,
    description: "",
    logoUrl: app.logoUrl ?? "",
  };
}

export function TriggerAppGrid({
  connected,
  connectable,
  query,
  onQueryChange,
  onSelectConnected,
  onSelectConnectable,
}: TriggerAppGridProps) {
  const { t } = useTranslation("routines");
  const q = query.trim().toLowerCase();
  const match = (name: string) => name.toLowerCase().includes(q);

  const shownConnected = q ? connected.filter((a) => match(a.name)) : connected;
  const filteredConnectable = q
    ? connectable.filter((a) => match(a.name)).slice(0, SEARCH_LIMIT)
    : connectable;
  const manyConnectable = connectable.length > CONNECTABLE_CAP;
  const shownConnectable = q
    ? filteredConnectable
    : manyConnectable
      ? []
      : connectable;

  const nothingConnectable = q
    ? filteredConnectable.length === 0
    : manyConnectable;

  return (
    <div className="flex flex-col gap-3">
      {connectable.length > 0 && (
        <div className="relative">
          <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-ink-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("triggerStep.searchPlaceholder")}
            className="w-full rounded-lg border border-ink/[0.08] bg-input py-2 pr-3 pl-8 text-ink text-sm outline-none transition-shadow focus:shadow-field"
          />
        </div>
      )}

      {shownConnected.length > 0 && (
        <Section title={t("triggerStep.connectedHeader")}>
          {shownConnected.map((a) => (
            <AppRow
              key={a.toolkit}
              display={toDisplay(a)}
              onClick={() => onSelectConnected(a)}
            />
          ))}
        </Section>
      )}

      <Section title={t("triggerStep.connectableHeader")}>
        {shownConnectable.length > 0 ? (
          shownConnectable.map((a) => (
            <AppRow
              key={a.toolkit}
              description={t("triggerStep.notConnected")}
              display={toDisplay(a)}
              onClick={() => onSelectConnectable(a)}
            />
          ))
        ) : (
          <p className="px-0.5 py-1 text-ink-muted text-sm md:col-span-2">
            {nothingConnectable
              ? q
                ? t("triggerStep.noMatches")
                : t("triggerStep.searchToConnect")
              : t("triggerStep.noConnectable")}
          </p>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="font-medium text-ink-muted text-xs">{title}</p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">{children}</div>
    </div>
  );
}
