"use client";

import { QuestionAnswerRow } from "./interaction-answer-row";
import { hasSelectableOptions } from "./interaction-card-logic";
import { BrandLogo, QuestionStepBody } from "./interaction-card-parts";
import type {
  ChatInteractionCardLabels,
  QuestionStep,
  StepChrome,
} from "./interaction-card-props";
import { InteractionDetail } from "./interaction-detail";
import { HireApprovalDetails } from "./interaction-hire-details";
import { InteractionModal, InteractionModalTitle } from "./interaction-modal";
import { InteractionUploadArea } from "./interaction-upload-area";
import type { CardAttach } from "./use-card-attachments";

export interface QuestionStepCopy {
  placeholder: string;
  escapePlaceholder: string;
  skip: string;
  send: string;
  esc: string;
  recommended: string;
  upload: string;
  filePlaceholder: string;
}

export function questionStepCopy(
  labels: ChatInteractionCardLabels | undefined,
): QuestionStepCopy {
  return {
    placeholder: labels?.placeholder ?? "Type your answer...",
    escapePlaceholder: labels?.escapePlaceholder ?? "Type another option...",
    skip: labels?.skip ?? "Skip",
    send: labels?.send ?? "Send",
    esc: labels?.esc ?? "Esc",
    recommended: labels?.recommended ?? "Recommended",
    upload: labels?.uploadFiles ?? "Upload your files",
    filePlaceholder: labels?.filePlaceholder ?? "Or type your answer...",
  };
}

export function InteractionQuestionStep({
  step,
  chrome,
  copy,
  draft,
  selectedId,
  attach,
  fileAnswer,
  stepFiles,
  onOption,
  onDraftChange,
  onSend,
  onSkip,
}: {
  step: QuestionStep;
  chrome: StepChrome;
  copy: QuestionStepCopy;
  draft: string;
  selectedId: string | null;
  attach: CardAttach | null;
  fileAnswer: boolean;
  stepFiles: readonly File[];
  onOption: (optionId: string) => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onSkip: () => void;
}) {
  const { disabled } = chrome;
  const optionsPresent = hasSelectableOptions(step.options);
  const brand = step.brand;
  const upload = step.wantsFiles === true ? attach : null;
  const body = (
    <div className="flex flex-col gap-2.5">
      {step.hire ? <HireApprovalDetails hire={step.hire} /> : null}
      {step.detail ? <InteractionDetail detail={step.detail} /> : null}
      {upload ? (
        <InteractionUploadArea
          attach={upload}
          disabled={disabled}
          files={stepFiles}
          label={copy.upload}
        />
      ) : null}
      <QuestionStepBody
        disabled={disabled}
        onOption={onOption}
        options={step.options}
        recommendedLabel={copy.recommended}
        selectedId={selectedId}
      />
    </div>
  );

  return (
    <InteractionModal
      contentKey={step.id}
      collapseLabel={chrome.collapseLabel}
      disabled={disabled}
      dismissLabel={chrome.dismissLabel}
      expandLabel={chrome.expandLabel}
      onDismiss={chrome.onDismiss}
      onOpenChange={chrome.onOpenChange}
      open={chrome.open}
      pager={chrome.pager}
      collapsedHint={brand ? step.question : undefined}
      title={
        brand ? (
          <InteractionModalTitle
            className="flex-1 truncate"
            icon={
              brand.logoUrl ? (
                <BrandLogo name={brand.name} url={brand.logoUrl} />
              ) : undefined
            }
          >
            {brand.name}
          </InteractionModalTitle>
        ) : (
          <InteractionModalTitle className="text-balance">
            {step.question}
          </InteractionModalTitle>
        )
      }
      body={
        brand ? (
          <div className="flex flex-col gap-2.5">
            <p className="text-balance text-ink text-sm leading-snug">
              {step.question}
            </p>
            {body}
          </div>
        ) : (
          body
        )
      }
      trailing={
        <QuestionAnswerRow
          attach={attach}
          disabled={disabled}
          draft={draft}
          fileAnswer={fileAnswer}
          hideFreeText={
            optionsPresent &&
            step.hideFreeText === true &&
            step.wantsFiles !== true
          }
          onDraftChange={onDraftChange}
          onSubmit={onSend}
          placeholder={
            upload
              ? copy.filePlaceholder
              : optionsPresent
                ? copy.escapePlaceholder
                : copy.placeholder
          }
          uploadArea={upload !== null}
          sendLabel={copy.send}
          skip={{ label: copy.skip, escLabel: copy.esc, onSkip, disabled }}
        />
      }
    />
  );
}
