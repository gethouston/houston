import { useIsMobile } from "@houston-ai/core";
import {
  type ChangeEventHandler,
  type ClipboardEventHandler,
  type KeyboardEventHandler,
  type ReactEventHandler,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import type { PromptInputMessage } from "./ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputBody,
  PromptInputHeader,
  PromptInputTextarea,
} from "./ai-elements/prompt-input";
import { ChatInputAttachButton } from "./chat-input-attach-button";
import type { ChatInputProps, InputStatus } from "./chat-input-types";
import type { ChatComposerLabels } from "./chat-panel-types";
import { clampComposerHeight } from "./composer-resize";
import { ComposerResizeHandle } from "./composer-resize-handle";
import { ComposerTrailing } from "./composer-trailing";
import type { DictationControl } from "./dictation-types";
import { DictationWaveform } from "./dictation-waveform";

export interface ChatInputFormProps {
  text: string;
  placeholder: string;
  status: InputStatus;
  hasContent: boolean;
  disabled: boolean;
  header?: ReactNode;
  attachMenu?: ChatInputProps["attachMenu"];
  dictation?: DictationControl;
  dictating: boolean;
  onSubmit: (message: PromptInputMessage) => void | Promise<void>;
  onOpenFilePicker: () => void;
  onOpenFolderPicker: () => void;
  onTextChange: ChangeEventHandler<HTMLTextAreaElement>;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>;
  onSelect: ReactEventHandler<HTMLTextAreaElement>;
  onStop?: () => void;
  mentionCombobox?: MentionComboboxAria;
  labels?: ChatComposerLabels;
}

export interface MentionComboboxAria {
  "aria-controls": string;
  "aria-activedescendant"?: string;
}

export function ChatInputForm({
  text,
  placeholder,
  status,
  hasContent,
  disabled,
  header,
  attachMenu,
  dictation,
  dictating,
  onSubmit,
  onOpenFilePicker,
  onOpenFolderPicker,
  onTextChange,
  onKeyDown,
  onPaste,
  onSelect,
  onStop,
  mentionCombobox,
  labels,
}: ChatInputFormProps) {
  const [manualHeight, setManualHeight] = useState<number | null>(null);
  const isMobile = useIsMobile();
  useEffect(() => {
    const onResize = () =>
      setManualHeight((height) =>
        height === null
          ? null
          : clampComposerHeight(height, window.innerHeight),
      );
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return (
    <PromptInput onSubmit={onSubmit}>
      {!dictating && (
        <ComposerResizeHandle
          height={manualHeight}
          label={labels?.resizeComposer}
          onResize={setManualHeight}
        />
      )}
      {header && (
        <PromptInputHeader className="pb-1">{header}</PromptInputHeader>
      )}

      <ChatInputAttachButton
        attachMenu={attachMenu}
        ariaLabel={labels?.attachFiles}
        disabled={disabled}
        onOpenFilePicker={onOpenFilePicker}
        onOpenFolderPicker={onOpenFolderPicker}
      />

      <PromptInputBody>
        {dictating && dictation ? (
          <DictationWaveform control={dictation} />
        ) : (
          <PromptInputTextarea
            {...mentionCombobox}
            aria-expanded={mentionCombobox ? true : undefined}
            disabled={disabled}
            manualHeight={isMobile ? null : manualHeight}
            onChange={onTextChange}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onSelect={onSelect}
            placeholder={placeholder}
            role={mentionCombobox ? "combobox" : undefined}
            value={text}
          />
        )}
      </PromptInputBody>

      <ComposerTrailing
        dictation={dictation}
        disabled={disabled}
        hasContent={hasContent}
        onStop={onStop}
        status={status}
        submitLabels={{ submit: labels?.submit, stop: labels?.stop }}
      />
    </PromptInput>
  );
}
