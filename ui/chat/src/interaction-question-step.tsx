"use client";

import { hasSelectableOptions } from "./interaction-card-logic";
import {
  BrandLogo,
  QuestionAnswerRow,
  QuestionStepBody,
} from "./interaction-card-parts";
import type { QuestionStep, StepChrome } from "./interaction-card-props";
import { InteractionDetail } from "./interaction-detail";
import { InteractionModal, InteractionModalTitle } from "./interaction-modal";

/** The already-translated copy a question step renders, resolved by the card. */
export interface QuestionStepCopy {
  placeholder: string;
  escapePlaceholder: string;
  skip: string;
  send: string;
  esc: string;
  recommended: string;
}

/**
 * A question step in the shared {@link InteractionModal} shell: the question
 * text in the modal TITLE, the option rows (LEFT number badge = keyboard
 * shortcut, regular-weight label, optional Recommended chip) as the scrollable
 * body, and the answer row (free-text escape field + the card-wide decline)
 * FIXED in the trailing slot so a long option list never scrolls it away.
 * Clicking an option answers and advances, so there is no primary CTA.
 *
 * A question carrying a `brand` (it concerns an integration) instead puts the
 * app's logo + NAME in the title, like the connect card, and moves the question
 * text into the body above the options — one asking system, branded when the app
 * resolved an identity.
 */
export function InteractionQuestionStep({
  step,
  chrome,
  copy,
  draft,
  selectedId,
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
  onOption: (optionId: string) => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onSkip: () => void;
}) {
  const { disabled } = chrome;
  const optionsPresent = hasSelectableOptions(step.options);
  const brand = step.brand;
  // The detail block sits ABOVE the options: it is what the question is about,
  // so it must be read before the answer is picked.
  const body = (
    <div className="flex flex-col gap-2.5">
      {step.detail ? <InteractionDetail detail={step.detail} /> : null}
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
      // A plain question's title IS the question, so only a branded question
      // (app name in the title, question in the body) needs the collapsed hint.
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
          disabled={disabled}
          draft={draft}
          hideFreeText={optionsPresent && step.hideFreeText === true}
          onDraftChange={onDraftChange}
          onSubmit={onSend}
          placeholder={
            optionsPresent ? copy.escapePlaceholder : copy.placeholder
          }
          sendLabel={copy.send}
          skip={{ label: copy.skip, escLabel: copy.esc, onSkip, disabled }}
        />
      }
    />
  );
}
