import type { Agent } from "@houston/engine-adapter";
import {
  ModelPicker,
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from "@houston-ai/core";
import { ChevronDown, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../hooks/use-capabilities";
import { useChatModelPicker } from "../hooks/use-chat-model-picker";
import { usePickerCeiling } from "../hooks/use-picker-ceiling";
import { modelSelectorDecision } from "../lib/model-selector-lock";
import { ModelTriggerGlyph } from "./chat-model-selector-trigger";

interface ChatModelSelectorProps {
  provider: string;
  model: string;
  onSelect: (provider: string, model: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  agent?: Pick<Agent, "id" | "access"> | null;
  allowedModels?: string[] | null;
  triggerLabel?: string;
  pickerFooter?: ReactNode;
  coloredGlyph?: boolean;
}

export function ChatModelSelector({
  provider,
  model,
  onSelect,
  open,
  onOpenChange,
  agent,
  allowedModels,
  triggerLabel,
  pickerFooter,
  coloredGlyph,
}: ChatModelSelectorProps) {
  const { t } = useTranslation("chat");
  const { capabilities } = useCapabilities();
  const { show } = modelSelectorDecision(capabilities, agent);
  const picker = useChatModelPicker({
    provider,
    model,
    onSelect,
    open,
    onOpenChange,
  });

  const { models, providers, hidden, labels, onEmptyStateAction } =
    usePickerCeiling(picker, allowedModels, agent);

  if (!show) return null;

  const readOnly = allowedModels != null && allowedModels.length === 1;

  const label = triggerLabel ?? picker.displayLabel;
  const glyph = (
    <ModelTriggerGlyph provider={provider} colored={coloredGlyph} />
  );

  return (
    <fieldset
      className="contents border-0 p-0 m-0"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {readOnly ? (
        <div className="flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs text-ink-muted whitespace-nowrap">
          {glyph}
          <span>{label}</span>
        </div>
      ) : (
        <ResponsivePopover open={picker.isOpen} onOpenChange={picker.setOpen}>
          <ResponsivePopoverTrigger asChild>
            <button
              type="button"
              className="flex shrink-0 items-center justify-center gap-1.5 h-11 min-w-11 px-2 rounded-lg text-xs text-ink-muted whitespace-nowrap hover:text-ink hover:bg-hover transition-[color,background-color,scale] active:scale-[0.96] outline-none md:h-7 md:min-w-0 md:shrink md:active:scale-100 focus-visible:ring-1 focus-visible:ring-focus"
            >
              {glyph}
              <span>{label}</span>
              <ChevronDown className="hidden md:block size-3 opacity-60" />
            </button>
          </ResponsivePopoverTrigger>
          <ResponsivePopoverContent
            title={t("modelSelector.selectModel")}
            align="start"
            className="w-[320px] p-0"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <ModelPicker
              models={models}
              providers={providers}
              selectedId={picker.selectedId}
              catalogState={picker.catalogState}
              onSelect={picker.onSelect}
              onConnectMore={picker.onConnectMore}
              onEmptyStateAction={onEmptyStateAction}
              renderProviderIcon={picker.renderProviderIcon}
              labels={labels}
              footer={
                pickerFooter || hidden > 0 ? (
                  <>
                    {pickerFooter}
                    {hidden > 0 && (
                      <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                        <Lock className="size-3 opacity-60" />
                        {t("modelSelector.picker.hiddenByWorkspace", {
                          count: hidden,
                        })}
                      </span>
                    )}
                  </>
                ) : undefined
              }
            />
          </ResponsivePopoverContent>
        </ResponsivePopover>
      )}
    </fieldset>
  );
}
