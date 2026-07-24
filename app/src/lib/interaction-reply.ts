import type {
  ChatInteractionAnswer,
  InteractionAnswerLine,
  InteractionAnswersPayload,
} from "@houston-ai/chat";
import {
  encodeAutoContinueMessage,
  isAutoContinueMessage,
} from "./auto-continue-message.ts";

/**
 * The single message an interaction sequence sends when its LAST step
 * completes (see `useAgentChatPanel`'s `composerOverride`). Composed ONCE, never
 * per-connect: a `request_connection` step that started a turn as it landed
 * would tear the interaction card down before the remaining steps could be
 * walked, so the whole sequence resumes the agent with exactly this one send.
 *
 * The body is `"<question>: <answer>"` per answered question, then
 * `"Signed in to Houston."` if a sign-in step completed (or "Skipped signing
 * in." if the user skipped it), then `"Connected <app>."` per connection that
 * landed and `"Skipped connecting <app>."` per connect step the user skipped —
 * a skip is a fact the agent MUST hear, or it re-requests the same app
 * forever. A sequence with questions sends that body visibly (the user typed
 * those answers). A connect-ONLY / signin+connect sequence has no user-typed
 * text, so it wraps the body in the auto-continue marker: the agent still
 * receives the instruction, but the transcript hides the bubble the user never
 * actually typed.
 *
 * A SIGNIN-ONLY sequence that actually signed in (no questions, no connect
 * steps walked or skipped, no approval decided) has nothing factual to relay, so
 * it resumes the agent with the dedicated hidden `signedInFollowup` ("I've signed
 * in. Please continue.") instead of the bare status line.
 *
 * After the connect lines come the APPROVAL decisions, in step order: a confirmed
 * action ("Do it") contributes `approvedLine(action)`, a declined one ("Not now")
 * `deniedLine(action)`, and a redirected one ("differently") `redoLine(action,
 * text)` — the RAW action slug, because the model reads this flat body and
 * re-issues the action (adjusting it for a redirection), so it names it verbatim.
 * (The VISIBLE transcript payload names the humanized action instead — see
 * {@link encodeInteractionAnswersMessage}.) A confirm/decline-only sequence (no
 * questions) resumes the agent hidden, like a connect-only one; a redirection
 * carries user-typed text, so its sequence resumes VISIBLY.
 *
 * A saved custom-integration key adds `credentialedLine(name)` ("Added the X
 * key."), a declined one `skippedCredentialLine(name)` ("Skipped adding the X
 * key.") — a skip the agent MUST hear, or it waits on a key that never comes. A
 * credential-ONLY sequence that saved every key resumes the agent hidden with
 * `credentialedFollowup`, like a connect-only one; a skip in the mix falls to the
 * visible/hidden body path so the "Skipped ..." fact survives.
 *
 * The line factories (`connectedLine` / `skippedConnectLine` / `signedInLine` /
 * `skippedSigninLine` / `signedInFollowup` / `approvedLine` / `deniedLine` /
 * `redoLine` / `credentialedLine` / `skippedCredentialLine`) are injected so this
 * stays i18n-agnostic and unit-testable — the caller passes the `t(...)` results.
 */
export function composeInteractionReply(args: {
  answers: ChatInteractionAnswer[];
  connectedNames: string[];
  /** Apps whose connect step the user skipped, in skip order. */
  skippedConnectNames: string[];
  /** Actions the user confirmed ("Do it"), raw slugs in step order. */
  approvedActions: string[];
  /** Actions the user declined ("Not now"), raw slugs in step order. */
  deniedActions: string[];
  /** Actions the user redirected ("differently"): the raw slug plus the verbatim
   *  text of what to do instead, in step order. */
  redoItems: { action: string; text: string }[];
  /** Custom integrations whose secret the user saved during THIS sequence. */
  credentialedNames: string[];
  /** Custom integrations whose credential step the user skipped, in skip order —
   *  a decline the agent MUST hear, or it waits on a key that never comes. */
  skippedCredentialNames: string[];
  hasQuestionSteps: boolean;
  /** A sign-in step completed in this sequence (the user is now signed in). */
  signedIn: boolean;
  /** The user skipped the sequence's sign-in step. */
  signinSkipped: boolean;
  connectedLine: (name: string) => string;
  /** The status line a skipped connect step contributes to the reply. */
  skippedConnectLine: (name: string) => string;
  /** The status line a saved custom-integration key contributes to a reply. */
  credentialedLine: (name: string) => string;
  /** The status line a skipped credential step contributes to the reply. */
  skippedCredentialLine: (name: string) => string;
  /** The status line a completed sign-in contributes to a composed reply. */
  signedInLine: string;
  /** The status line a skipped sign-in step contributes to the reply. */
  skippedSigninLine: string;
  /** The hidden resume message for a signin-ONLY sequence (nothing else to say). */
  signedInFollowup: string;
  /** The go-ahead line a confirmed action contributes (raw slug). */
  approvedLine: (action: string) => string;
  /** The refusal line a declined action contributes (raw slug). */
  deniedLine: (action: string) => string;
  /** The redirection line a "differently" action contributes: the raw slug plus
   *  the user's verbatim text (the model adjusts and re-issues). */
  redoLine: (action: string, text: string) => string;
  /** The hidden resume message for a credential-ONLY sequence (secret saved). */
  credentialedFollowup: string;
}): string {
  // Signin-only, actually signed in: no answers to relay, no connection and no
  // skip to name, and no approval decided, so send the friendlier hidden followup
  // rather than a lone "Signed in to Houston." line.
  if (
    !args.hasQuestionSteps &&
    args.signedIn &&
    args.connectedNames.length === 0 &&
    args.skippedConnectNames.length === 0 &&
    args.approvedActions.length === 0 &&
    args.deniedActions.length === 0 &&
    args.redoItems.length === 0 &&
    args.credentialedNames.length === 0 &&
    args.skippedCredentialNames.length === 0
  )
    return encodeAutoContinueMessage(args.signedInFollowup);

  // Credential-only, all saved: mirror the signin-only case — resume the agent
  // with the dedicated hidden followup ("I've added the X key. Please continue.")
  // instead of a bare "Added the X key." status line. A skip in the mix drops to
  // the general path below so the agent still hears the "Skipped ..." fact.
  if (
    !args.hasQuestionSteps &&
    !args.signedIn &&
    args.connectedNames.length === 0 &&
    args.skippedConnectNames.length === 0 &&
    args.skippedCredentialNames.length === 0 &&
    args.redoItems.length === 0 &&
    args.credentialedNames.length > 0
  )
    return encodeAutoContinueMessage(args.credentialedFollowup);

  const lines = args.answers.map((a) => `${a.question}: ${a.answer}`);
  if (args.signedIn) lines.push(args.signedInLine);
  if (args.signinSkipped) lines.push(args.skippedSigninLine);
  for (const name of args.connectedNames) lines.push(args.connectedLine(name));
  for (const name of args.skippedConnectNames)
    lines.push(args.skippedConnectLine(name));
  for (const action of args.approvedActions)
    lines.push(args.approvedLine(action));
  for (const action of args.deniedActions) lines.push(args.deniedLine(action));
  for (const item of args.redoItems)
    lines.push(args.redoLine(item.action, item.text));
  for (const name of args.credentialedNames)
    lines.push(args.credentialedLine(name));
  for (const name of args.skippedCredentialNames)
    lines.push(args.skippedCredentialLine(name));
  const body = lines.join("\n");
  // A redirection carries user-typed text, so its sequence resumes VISIBLY
  // (the transcript should show what the user asked), like a question sequence.
  const visible = args.hasQuestionSteps || args.redoItems.length > 0;
  return visible ? body : encodeAutoContinueMessage(body);
}

/** One connect step's FINAL outcome in a walked sequence: the app's display
 *  name and whether it ended connected (true) or skipped (false). A step skipped
 *  then reconsidered records `connected: true` — the LAST outcome for a step id
 *  wins, so the composed reply never carries a stale "Skipped ..." line. */
export interface ConnectOutcome {
  name: string;
  connected: boolean;
}

/**
 * Split the connect steps' FINAL outcomes into the connected + skipped name
 * lists the reply names, in step order. Keyed by step id, so recording a
 * connect over an earlier skip for the SAME step (a reconsider) — or a repeated
 * skip — yields exactly one entry per step, in the connected OR the skipped
 * list, never both. Steps with no recorded outcome (never reached) are omitted.
 */
export function finalConnectNames(
  connectStepIds: string[],
  outcomes: Map<string, ConnectOutcome>,
): { connectedNames: string[]; skippedConnectNames: string[] } {
  const connectedNames: string[] = [];
  const skippedConnectNames: string[] = [];
  for (const id of connectStepIds) {
    const outcome = outcomes.get(id);
    if (!outcome) continue;
    (outcome.connected ? connectedNames : skippedConnectNames).push(
      outcome.name,
    );
  }
  return { connectedNames, skippedConnectNames };
}

/** One credential step's FINAL outcome in a walked sequence: the integration's
 *  display name and whether its key ended saved (true) or skipped (false). A step
 *  skipped then reconsidered records `saved: true` — the LAST outcome for a step
 *  id wins, so the reply never carries a stale "Skipped ..." line. Mirrors
 *  {@link ConnectOutcome}. */
export interface CredentialOutcome {
  name: string;
  saved: boolean;
}

/**
 * Split the credential steps' FINAL outcomes into the saved + skipped name lists
 * the reply names, in step order. Keyed by step id, so saving a key over an
 * earlier skip for the SAME step (a reconsider) — or a repeated skip — yields
 * exactly one entry per step, never both. Steps with no recorded outcome (never
 * reached) are omitted. Mirrors {@link finalConnectNames}.
 */
export function finalCredentialNames(
  credentialStepIds: string[],
  outcomes: Map<string, CredentialOutcome>,
): { credentialedNames: string[]; skippedCredentialNames: string[] } {
  const credentialedNames: string[] = [];
  const skippedCredentialNames: string[] = [];
  for (const id of credentialStepIds) {
    const outcome = outcomes.get(id);
    if (!outcome) continue;
    (outcome.saved ? credentialedNames : skippedCredentialNames).push(
      outcome.name,
    );
  }
  return { credentialedNames, skippedCredentialNames };
}

/** Humanized display parts for one approval's VISIBLE transcript line: the app
 *  name (`prettifyToolkit`) and the humanized action (`humanizeActionSlug`). The
 *  model reads the raw slug; the user reads these. */
export interface ApprovalDisplay {
  app: string;
  action: string;
}

/** One approval step's FINAL decision in a walked sequence: the RAW action slug
 *  (what the model re-issues), a humanized `display` (what the user reads), the
 *  decision (confirmed "doIt", declined "notNow", or redirected "differently"),
 *  and — for a redirection — the verbatim `text` of what to do instead. A step
 *  decided more than once (walked Back and re-decided) records the LAST decision
 *  — the panel keys the outcome by step id, so one entry survives per step. */
export interface ApprovalOutcome {
  action: string;
  decision: "doIt" | "notNow" | "differently";
  display: ApprovalDisplay;
  /** The redirection text, present only when `decision === "differently"`. */
  text?: string;
}

/** One redirected approval's verbatim body item: the RAW slug the model
 *  re-issues plus the user's text. */
export interface RedoItem {
  action: string;
  text: string;
}

/** One redirected approval's VISIBLE display: the humanized app + action plus
 *  the user's text. */
export interface RedoDisplay {
  display: ApprovalDisplay;
  text: string;
}

/**
 * Split the approval steps' FINAL decisions into the confirmed + declined +
 * redirected lists the reply names, in step order — the RAW slugs (for the flat
 * body the model reads) paired with the humanized `display`s (for the visible
 * transcript payload). Keyed by step id, so re-deciding the SAME step yields
 * exactly one entry per step, in exactly one list. Steps with no recorded
 * decision (never reached) are omitted. Mirrors {@link finalConnectNames}.
 */
export function finalApprovalNames(
  approvalStepIds: string[],
  outcomes: Map<string, ApprovalOutcome>,
): {
  approvedActions: string[];
  deniedActions: string[];
  redoItems: RedoItem[];
  approvedDisplays: ApprovalDisplay[];
  deniedDisplays: ApprovalDisplay[];
  redoDisplays: RedoDisplay[];
} {
  const approvedActions: string[] = [];
  const deniedActions: string[] = [];
  const redoItems: RedoItem[] = [];
  const approvedDisplays: ApprovalDisplay[] = [];
  const deniedDisplays: ApprovalDisplay[] = [];
  const redoDisplays: RedoDisplay[] = [];
  for (const id of approvalStepIds) {
    const outcome = outcomes.get(id);
    if (!outcome) continue;
    if (outcome.decision === "notNow") {
      deniedActions.push(outcome.action);
      deniedDisplays.push(outcome.display);
    } else if (outcome.decision === "differently") {
      const text = outcome.text ?? "";
      redoItems.push({ action: outcome.action, text });
      redoDisplays.push({ display: outcome.display, text });
    } else {
      approvedActions.push(outcome.action);
      approvedDisplays.push(outcome.display);
    }
  }
  return {
    approvedActions,
    deniedActions,
    redoItems,
    approvedDisplays,
    deniedDisplays,
    redoDisplays,
  };
}

const MARKER_PREFIX = "<!--houston:interaction-answers ";
const MARKER_SUFFIX = "-->";

/**
 * The interaction reply, wrapped so the transcript can render the answers as a
 * structured Q&A card instead of an undifferentiated text bubble.
 *
 * Takes the SAME inputs as {@link composeInteractionReply} and delegates to it
 * for the flat body the model reads — behavior for the agent is unchanged. On
 * top it carries the SAME information in a structured `InteractionAnswersPayload`
 * (decoded + rendered by `@houston-ai/chat`) behind an HTML-comment marker,
 * exactly like the Skill marker.
 *
 * A hidden auto-continue sequence (connect-only / signin-only, no questions)
 * never renders a user bubble, so there is nothing to structure-render: the
 * flat reply is returned unchanged, no marker added.
 *
 * The one place the payload DIVERGES from the flat body: approval lines. The
 * body names the RAW slug (the model must re-issue it), but the VISIBLE payload
 * a non-technical user reads uses the humanized `*LineDisplay` factories ("Allowed
 * Gmail to send draft." instead of "…GMAIL_SEND_DRAFT."), so the extra `*Displays`
 * + `*LineDisplay` args here carry that human phrasing.
 */
export function encodeInteractionAnswersMessage(
  args: Parameters<typeof composeInteractionReply>[0] & {
    /** Humanized display parts for approved actions, aligned with the body's
     *  `approvedActions` (step order); the payload names these, not the slug. */
    approvedDisplays: ApprovalDisplay[];
    deniedDisplays: ApprovalDisplay[];
    /** Humanized display + text for redirected actions, aligned with the body's
     *  `redoItems` (step order). */
    redoDisplays: RedoDisplay[];
    /** The VISIBLE transcript line for a confirmed action (humanized app + action). */
    approvedLineDisplay: (display: ApprovalDisplay) => string;
    /** The VISIBLE transcript line for a declined action (humanized app + action). */
    deniedLineDisplay: (display: ApprovalDisplay) => string;
    /** The VISIBLE transcript line for a redirected action (humanized app +
     *  action, plus the user's verbatim text). */
    redoLineDisplay: (display: ApprovalDisplay, text: string) => string;
  },
): string {
  const body = composeInteractionReply(args);
  // Hidden (no visible bubble) → leave the flat reply untouched.
  if (isAutoContinueMessage(body)) return body;

  const lines: InteractionAnswerLine[] = args.answers.map((a) => ({
    question: a.question,
    answer: a.answer,
  }));
  if (args.signedIn) lines.push({ answer: args.signedInLine });
  if (args.signinSkipped) lines.push({ answer: args.skippedSigninLine });
  for (const name of args.connectedNames)
    lines.push({ answer: args.connectedLine(name) });
  for (const name of args.skippedConnectNames)
    lines.push({ answer: args.skippedConnectLine(name) });
  // The visible line names the humanized action + app, not the raw slug.
  for (const display of args.approvedDisplays)
    lines.push({ answer: args.approvedLineDisplay(display) });
  for (const display of args.deniedDisplays)
    lines.push({ answer: args.deniedLineDisplay(display) });
  for (const rd of args.redoDisplays)
    lines.push({ answer: args.redoLineDisplay(rd.display, rd.text) });
  for (const name of args.credentialedNames)
    lines.push({ answer: args.credentialedLine(name) });
  for (const name of args.skippedCredentialNames)
    lines.push({ answer: args.skippedCredentialLine(name) });

  const payload: InteractionAnswersPayload = { lines };
  return `${MARKER_PREFIX}${JSON.stringify(payload)}${MARKER_SUFFIX}\n\n${body}`;
}
