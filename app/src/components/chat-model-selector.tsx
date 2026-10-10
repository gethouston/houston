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
  /** Current provider id (from agent config / per-mission override). */
  provider: string;
  /** Current model id. */
  model: string;
  /**
   * Called when the user picks a provider + model. The provider is never
   * locked: switching to a different provider mid-conversation is supported.
   * The runtime resolves the provider per turn and continues the same
   * conversation, and the consumer (`use-agent-chat-panel`) stages the handoff
   * so the engine carries context across.
   */
  onSelect: (provider: string, model: string) => void;
  /**
   * Optional controlled open state so another surface can pop the picker open —
   * e.g. a `model_unavailable` error card's "Pick another model" CTA. Omit both
   * to leave the picker uncontrolled (its default trigger-click behavior).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * The agent this selector configures, when rendered in an agent-scoped
   * surface (the composer). Threaded so the picker follows the Teams matrix:
   * single-player and managers/owners always see it; a multiplayer Teams member
   * also sees it (Change 3 reversed E7's hide-for-members), while a member on a
   * pre-Teams multiplayer host stays hidden. Omit outside an agent scope and the
   * picker always shows. The id is where a ceiling-emptied picker sends its
   * manager: this agent's Models settings.
   */
  agent?: Pick<Agent, "id" | "access"> | null;
  /**
   * The agent's effective allowed-models ceiling (Teams E8): the option list is
   * clamped to it. `null`/`undefined` = no ceiling (every model). When it holds
   * exactly one model the picker renders that model read-only (still visible).
   */
  allowedModels?: string[] | null;
  /**
   * Overrides the trigger's model label — the routine screen names the resolved
   * pair ("Claude · Opus 5") rather than the model alone, since a routine fires
   * unattended and the AI ACCOUNT is half of what runs it (PRODUCT-1475). Omit
   * for the picker's own display label. An empty `provider` drops the glyph.
   */
  triggerLabel?: string;
  /** Extra footer row inside the picker popover (the routine pin's "Use the
   *  agent's model" reset). Omit for none. */
  pickerFooter?: ReactNode;
  /** Render the trigger's provider glyph in full brand color (the routine
   *  screen's Model field). Omit for the composer's monochrome glyph. */
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

  // The allowed-models ceiling (Teams E8): the clamped list, the count of
  // models it turns off, and the empty state when it turns off every one.
  const { models, providers, hidden, labels, onEmptyStateAction } =
    usePickerCeiling(picker, allowedModels, agent);

  // A plain member on a pre-Teams multiplayer host never sees the agent's model:
  // the picker renders nothing. The hooks above still run so the rules-of-hooks
  // order stays stable across the show/hide flip.
  if (!show) return null;

  // Exactly one allowed model: the pick is fixed, so render it read-only (still
  // visible) rather than a one-row popover (contract Change 3).
  const readOnly = allowedModels != null && allowedModels.length === 1;

  const label = triggerLabel ?? picker.displayLabel;
  const glyph = (
    <ModelTriggerGlyph provider={provider} colored={coloredGlyph} />
  );

  return (
    // Stop pointer events from bubbling — prevents the board detail panel
    // from interpreting trigger clicks as "click outside → close panel".
    <fieldset
      className="contents border-0 p-0 m-0"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {readOnly ? (
        // The one allowed model, read-only: no dropdown affordance signals it is
        // fixed, and the visible label is its own accessible name.
        <div className="flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs text-ink-muted whitespace-nowrap">
          {glyph}
          <span>{label}</span>
        </div>
      ) : (
        <ResponsivePopover open={picker.isOpen} onOpenChange={picker.setOpen}>
          <ResponsivePopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs text-ink-muted whitespace-nowrap hover:text-ink hover:bg-hover transition-colors outline-none focus-visible:ring-1 focus-visible:ring-focus"
            >
              {glyph}
              <span>{label}</span>
              <ChevronDown className="hidden md:block size-3 opacity-60" />
            </button>
          </ResponsivePopoverTrigger>
          {/* `p-0` on the shared popover chrome, the same dropdown surface as
              FilterCombobox; the picker fills it edge to edge (on the phone, a
              bottom sheet). Auto-focus is prevented both ways: the picker
              places focus itself (input or cmdk root, per screen), and closing
              must not yank focus back. */}
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
