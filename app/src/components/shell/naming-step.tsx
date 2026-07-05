import {
  AGENT_COLORS,
  Button,
  cn,
  colorHex,
  DialogTitle,
  HoustonAvatar,
  Input,
  resolveAgentColor,
  Spinner,
} from "@houston-ai/core";
import { ArrowLeft, Check, ChevronDown, FolderOpen } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { localizeCatalogCopy } from "../../agents/catalog-labels";
import { getModel, getProvider, PROVIDERS } from "../../lib/providers";
import { type ProviderStatus, tauriProvider } from "../../lib/tauri";
import type { AgentDefinition } from "../../lib/types";

interface NamingStepProps {
  selectedAgent: AgentDefinition | undefined;
  name: string;
  color: string | undefined;
  error: string | null;
  existingPath: string | null;
  provider: string;
  model: string;
  /** The create request is in flight — lock the submit and show progress. */
  creating: boolean;
  /** Show "Link existing project" option (opt-in via agent features). */
  showLinkProject?: boolean;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onExistingPathChange: (path: string | null) => void;
  onProviderChange: (provider: string, model: string) => void;
  onBack: () => void;
  onSubmit: (e: FormEvent) => void;
}

export function NamingStep({
  selectedAgent,
  name,
  color,
  error,
  existingPath,
  provider,
  model,
  creating,
  onNameChange,
  onColorChange,
  onExistingPathChange,
  showLinkProject,
  onProviderChange,
  onBack,
  onSubmit,
}: NamingStepProps) {
  const { t } = useTranslation(["shell", "agents"]);
  // Default to white on mount if none selected
  const resolvedColor = resolveAgentColor(color);
  const selectedName = selectedAgent
    ? localizeCatalogCopy(selectedAgent.config, t).name
    : t("naming.newAgentFallback");

  useEffect(() => {
    if (!color) {
      onColorChange(AGENT_COLORS[0].id);
    }
  }, [color, onColorChange]);

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-16">
      <button
        type="button"
        onClick={onBack}
        className="absolute top-5 left-5 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <DialogTitle className="sr-only">{t("naming.dialogTitle")}</DialogTitle>

      {/* Avatar preview */}
      <div className="flex flex-col items-center gap-4 mb-8">
        <HoustonAvatar color={resolvedColor} diameter={80} />

        <div className="text-center">
          <p className="text-lg font-semibold">{selectedName}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("naming.tagline")}
          </p>
        </div>
      </div>

      {/* Color palette */}
      <div className="flex items-center gap-2 mb-6">
        {AGENT_COLORS.map((c) => {
          const hex = colorHex(c);
          const isSelected =
            color === c.id || color === c.light || color === c.dark;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onColorChange(c.id)}
              className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center transition-all duration-150",
                isSelected
                  ? "ring-2 ring-offset-2 ring-foreground/30"
                  : "hover:scale-110",
              )}
              style={{ backgroundColor: hex }}
            >
              {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
            </button>
          );
        })}
      </div>

      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <Input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t("naming.namePlaceholder")}
          className="text-center rounded-full"
        />

        {/* Link existing project — opt-in via agent features */}
        {showLinkProject && (
          <div className="flex flex-col items-center gap-1.5">
            {existingPath ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary rounded-full px-3 py-1.5">
                <FolderOpen className="size-3" />
                <span className="truncate max-w-[200px]">
                  {existingPath.split("/").pop()}
                </span>
                <button
                  type="button"
                  onClick={() => onExistingPathChange(null)}
                  className="text-muted-foreground hover:text-foreground ml-1"
                >
                  &times;
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const { tauriAgents } = await import("../../lib/tauri");
                  const picked = await tauriAgents.pickDirectory();
                  if (picked) {
                    onExistingPathChange(picked);
                    if (!name.trim()) {
                      const folderName =
                        picked.replace(/\/$/, "").split("/").pop() ?? "";
                      onNameChange(folderName);
                    }
                  }
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                <FolderOpen className="size-3" />
                {t("naming.linkExistingProject")}
              </button>
            )}
          </div>
        )}

        {/* AI model selector */}
        <InlineModelSelector
          provider={provider}
          model={model}
          onSelect={onProviderChange}
        />

        {error && (
          <p className="text-xs text-destructive text-center">{error}</p>
        )}
        <Button
          type="submit"
          disabled={!name.trim() || creating}
          className="w-full rounded-full"
        >
          {creating ? (
            <>
              <Spinner className="size-4" />
              {t("naming.createAgent")}
            </>
          ) : (
            t("naming.createAgent")
          )}
        </Button>
      </form>
    </div>
  );
}

/** Bigger model selector for the agent creation dialog. */
export function InlineModelSelector({
  provider,
  model,
  onSelect,
}: {
  provider: string;
  model: string;
  onSelect: (provider: string, model: string) => void;
}) {
  const { t } = useTranslation(["providers", "chat"]);
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});
  const [open, setOpen] = useState(false);

  const loadStatuses = useCallback(async () => {
    // ONE round-trip for all providers (HOU-650) instead of a probe per card.
    setStatuses(
      await tauriProvider.checkAllStatuses(PROVIDERS.map((p) => p.id)),
    );
  }, []);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  const currentProvider = getProvider(provider);
  const currentModel = getModel(provider, model);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left",
          open
            ? "border-foreground/20 bg-secondary"
            : "border-border hover:border-foreground/15 hover:bg-accent/50",
        )}
      >
        <ProviderIcon providerId={provider} className="size-5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {currentModel?.label ?? model}
          </div>
          <div className="text-xs text-muted-foreground">
            {currentProvider?.name}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="mt-2 max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-1 space-y-0.5">
          {PROVIDERS.map((prov) => {
            const status = statuses[prov.id];
            const connected =
              (status?.cli_installed && status?.authenticated) ?? false;
            if (!connected && prov.id !== provider) return null;
            return (
              <div key={prov.id}>
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground">
                  <ProviderIcon providerId={prov.id} className="size-3.5" />
                  {prov.name}
                  {!connected && (
                    <span className="text-[10px] text-muted-foreground/60 ml-auto">
                      {t("card.notConnected")}
                    </span>
                  )}
                </div>
                {prov.models.map((m) => {
                  const isActive = prov.id === provider && m.id === model;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!connected}
                      onClick={() => {
                        onSelect(prov.id, m.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-colors",
                        isActive ? "bg-accent" : "hover:bg-accent/50",
                        !connected && "opacity-50 cursor-not-allowed",
                      )}
                    >
                      <div className="w-4 shrink-0 mt-0.5 flex justify-center">
                        {isActive && (
                          <Check className="h-3.5 w-3.5 text-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">{m.label}</div>
                        <div className="text-xs text-muted-foreground leading-snug">
                          {t(
                            `chat:modelSelector.modelDescriptions.${m.id.replace(/\./g, "_")}`,
                            { defaultValue: m.description },
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProviderIcon({
  providerId,
  className,
}: {
  providerId: string;
  className?: string;
}) {
  if (providerId === "anthropic") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill="currentColor"
        role="img"
        aria-label="Anthropic"
      >
        <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      role="img"
      aria-label="OpenAI"
    >
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.047 6.047 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  );
}
