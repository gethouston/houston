import type { ReactNode } from "react";
import type {
  ChatInteractionAnswer,
  ChatInteractionStep,
  StepperState,
} from "./interaction-card-logic";
import type { InteractionModalPager } from "./interaction-modal";

type ConnectStep = Extract<ChatInteractionStep, { kind: "connect" }>;
type SigninStep = Extract<ChatInteractionStep, { kind: "signin" }>;
type CredentialStep = Extract<ChatInteractionStep, { kind: "credential" }>;
type CustomStep = Extract<ChatInteractionStep, { kind: "custom" }>;
export type QuestionStep = Extract<ChatInteractionStep, { kind: "question" }>;

export interface StepChrome {
  pager: InteractionModalPager | null;
  onDismiss?: () => void;
  dismissLabel: string;
  collapseLabel: string;
  expandLabel: string;
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface StepFooterApi {
  revisited: boolean;
  onSkip: () => void;
  draft: string;
  onDraftChange: (text: string) => void;
}

export interface ChatInteractionCardLabels {
  placeholder?: string;
  escapePlaceholder?: string;
  skip?: string;
  send?: string;
  esc?: string;
  back?: string;
  forward?: string;
  dismiss?: string;
  collapse?: string;
  expand?: string;
  attachedAnswer?: string;
  uploadFiles?: string;
  filePlaceholder?: string;
  recommended?: string;
  progress?: (current: number, total: number) => string;
}

export type CardCompletion = (
  answers: ChatInteractionAnswer[],
  files: File[],
  // biome-ignore lint/suspicious/noConfusingVoidType: a plain `void` callback (one that sends no files) must stay assignable.
) => void | Promise<boolean>;

export interface ChatInteractionCardProps {
  steps: ChatInteractionStep[];
  onComplete: CardCompletion;
  renderConnect: (
    step: ConnectStep,
    api: StepFooterApi & StepChrome & { onConnected: () => void },
  ) => ReactNode;
  renderSignin: (
    step: SigninStep,
    api: StepFooterApi & StepChrome & { onSignedIn: () => void },
  ) => ReactNode;
  renderCredential: (
    step: CredentialStep,
    api: StepFooterApi & StepChrome & { onSaved: () => void },
  ) => ReactNode;
  renderCustom?: (
    step: CustomStep,
    api: StepFooterApi & StepChrome & { onDone: () => void },
  ) => ReactNode;
  onDismiss?: () => void;
  state?: StepperState;
  onStateChange?: (state: StepperState) => void;
  disabled?: boolean;
  completionKey?: string;
  labels?: ChatInteractionCardLabels;
}
