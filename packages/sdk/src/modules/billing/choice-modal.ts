import type { BillingChoice } from "@houston/wire-types";
import {
  type ChoiceContext,
  type ChoiceNotice,
  choiceNotice,
} from "./choice-model";
import type { planDialog } from "./model";

export type AnnouncedChoice = Extract<
  ChoiceNotice,
  { kind: "pick" | "single_org" | "member" | "confirm" | "applied" }
>;

export interface ChoiceModalContext extends ChoiceContext {
  closedThisSession: boolean;
  otherDialogOpen: boolean;
}

export type ChoiceModal =
  | { open: false; behindDialog: boolean }
  | { open: true; notice: AnnouncedChoice; close: "session" | "everywhere" };

const CLOSED: ChoiceModal = { open: false, behindDialog: false };

export type ShownChoiceModal = Extract<ChoiceModal, { open: true }>;

export function choiceModal(
  choice: BillingChoice | null | undefined,
  context: ChoiceModalContext,
): ChoiceModal {
  if (context.closedThisSession) return CLOSED;
  if (context.otherDialogOpen) return { open: false, behindDialog: true };
  const notice = choiceNotice(choice, context);
  switch (notice.kind) {
    case "pick":
    case "confirm":
      return { open: true, notice, close: "session" };
    case "single_org":
    case "member":
    case "applied":
      return { open: true, notice, close: "everywhere" };
    default:
      return CLOSED;
  }
}

export function planDialogBlocks(
  dialog: ReturnType<typeof planDialog>,
  state: { planLoading: boolean; announcementClosed: boolean },
): boolean {
  if (state.planLoading) return true;
  return dialog === "announcement"
    ? !state.announcementClosed
    : dialog !== null;
}
