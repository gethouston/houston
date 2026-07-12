import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@houston-ai/core";
import { Check, Laptop } from "lucide-react";
import { useTranslation } from "react-i18next";
import { appDisplayName, type DetectedServer } from "../../lib/local-model";
import { ManualLink, ReasoningToggle } from "./local-model-dialog-parts";
import { ShareEndpointToggle } from "./local-model-share-toggle";

/**
 * Pick a detected local server + one of its models, then Connect. Non-technical:
 * apps are named by brand, the model is a plain dropdown, no ports or URLs.
 */
export function PickScreen({
  servers,
  selected,
  onSelectServer,
  model,
  onSelectModel,
  reasoning,
  onReasoningChange,
  shared,
  onSharedChange,
  teamWorkspace,
  onConnect,
  onManual,
}: {
  servers: DetectedServer[];
  selected: number;
  onSelectServer: (index: number) => void;
  model: string;
  onSelectModel: (model: string) => void;
  reasoning: boolean;
  onReasoningChange: (value: boolean) => void;
  shared: boolean;
  onSharedChange: (value: boolean) => void;
  teamWorkspace: boolean;
  onConnect: () => void;
  onManual: () => void;
}) {
  const { t } = useTranslation("providers");
  const current = servers[selected];
  return (
    <div className="flex flex-col gap-4 py-2">
      <p className="text-[13px] leading-relaxed text-ink-muted">
        {t("localModel.pick.body")}
      </p>
      <div className="flex flex-col gap-2">
        {servers.map((server, index) => {
          const active = index === selected;
          return (
            <button
              key={server.baseUrl}
              type="button"
              onClick={() => onSelectServer(index)}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${active ? "border-focus bg-card" : "border-line bg-chip hover:bg-card-hover"}`}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-card text-ink-muted">
                <Laptop className="size-4" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[13px] font-medium text-ink">
                  {appDisplayName(server.kind)}
                </span>
                <span className="text-[11px] text-ink-muted">
                  {t("localModel.pick.modelsFound", {
                    count: server.models.length,
                  })}
                </span>
              </span>
              {active && (
                <Check
                  className="size-4 shrink-0 text-ink"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">
          {t("localModel.pick.modelLabel")}
        </span>
        <Select value={model} onValueChange={onSelectModel}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(current?.models ?? []).map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ReasoningToggle checked={reasoning} onChange={onReasoningChange} />
      {teamWorkspace && (
        <ShareEndpointToggle checked={shared} onChange={onSharedChange} />
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        <ManualLink onClick={onManual} />
        <Button onClick={onConnect} disabled={!model}>
          {t("localModel.pick.connect")}
        </Button>
      </div>
    </div>
  );
}
