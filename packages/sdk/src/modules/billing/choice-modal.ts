import type { BillingChoice } from "@houston/wire-types";
import {
  type ChoiceContext,
  type ChoiceNotice,
  choiceNotice,
} from "./choice-model";
import type { planDialog } from "./model";

/** The notices the pricing-change modal announces. */
export type AnnouncedChoice = Extract<
  ChoiceNotice,
  { kind: "pick" | "single_org" | "member" }
>;

export interface ChoiceModalContext extends ChoiceContext {
  /**
   * The person closed the modal since the app last opened, by "Maybe later",
   * "Got it" or the X. Whatever the dismissal did on the server, it stays
   * closed until the next app open.
   */
  closedThisSession: boolean;
  /**
   * A plan dialog is showing, or the plan it depends on is still loading
   * ({@link planDialogBlocks}). The modal never stacks on one: it waits until
   * it is gone.
   */
  otherDialogOpen: boolean;
}

/**
 * Whether the pricing-change modal shows when the app opens, and what closing
 * it does. Closing always hides it for the session. `session`: an owner who
 * still has to pick sees it on every app open until they do, so that is all
 * closing does. `everywhere`: a read-only notice, shown once; closing also
 * stores the dismissal on the server (`dismissChoiceNotice`) so no device
 * shows it again. A dismissal that fails leaves the server record unset, so
 * the notice shows on a later app open and closing it retries.
 * `behindDialog`: a closed modal is only waiting for a plan dialog to go, so
 * the frame can hold a success step until then ({@link nextChoiceModalFrame}).
 */
export type ChoiceModal =
  | { open: false; behindDialog: boolean }
  | { open: true; notice: AnnouncedChoice; close: "session" | "everywhere" };

const CLOSED: ChoiceModal = { open: false, behindDialog: false };

/** The modal while it is open: what it announces and what closing does. */
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
      return { open: true, notice, close: "session" };
    case "single_org":
    case "member":
      return { open: true, notice, close: "everywhere" };
    default:
      return CLOSED;
  }
}

/**
 * Whether a plan dialog keeps the pricing-change modal waiting: one is
 * showing, or the plan is still loading and may yet bring one. The launch
 * announcement is the only plan dialog closed for the session, so a closed
 * one no longer blocks. Pass the dialog the surface may actually open.
 */
export function planDialogBlocks(
  dialog: ReturnType<typeof planDialog>,
  state: { planLoading: boolean; announcementClosed: boolean },
): boolean {
  if (state.planLoading) return true;
  return dialog === "announcement"
    ? !state.announcementClosed
    : dialog !== null;
}
