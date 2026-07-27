/**
 * The composer box itself: header slot, attach button, textarea (or the
 * dictation waveform that replaces it), and the trailing send/stop controls.
 *
 * Split out of `chat-input.tsx` so that file stays the composer's STATE — text,
 * attachments, mentions, dictation — and this one stays its layout.
 */

import type {
  ChangeEventHandler,
  ClipboardEventHandler,
  KeyboardEventHandler,
  ReactEventHandler,
  ReactNode,
} from "react";
import type { PromptInputMessage } from "./ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputBody,
  PromptInputHeader,
  PromptInputTextarea,
} from "./ai-elements/prompt-input";
import { ComposerTrailing } from "./attachment-chip";
import { ChatInputAttachButton } from "./chat-input-attachments";
import type { ChatInputProps, InputStatus } from "./chat-input-types";
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
  /** The waveform replaces the textarea while dictation is live. */
  dictating: boolean;
  onSubmit: (message: PromptInputMessage) => void | Promise<void>;
  onOpenFilePicker: () => void;
  onOpenFolderPicker: () => void;
  onTextChange: ChangeEventHandler<HTMLTextAreaElement>;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>;
  /** Caret moved (arrow keys, click): re-reads the active "@query". */
  onSelect: ReactEventHandler<HTMLTextAreaElement>;
  onStop?: () => void;
  /** Combobox wiring for the @mention list (HOU-944). Focus never leaves the
   *  textarea, so IT is the combobox and the list is what it controls; absent
   *  while no list is open, which reverts the textarea to a plain one. */
  mentionCombobox?: MentionComboboxAria;
}

/** The ARIA a focused textarea needs to announce an open, navigable list. */
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
}: ChatInputFormProps) {
  return (
    <PromptInput onSubmit={onSubmit}>
      {header && (
        <PromptInputHeader className="pb-1">{header}</PromptInputHeader>
      )}

      <ChatInputAttachButton
        attachMenu={attachMenu}
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
      />
    </PromptInput>
  );
}
