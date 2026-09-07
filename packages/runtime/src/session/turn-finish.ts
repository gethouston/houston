/**
 * The marks a turn's finish is decided on, held by the per-turn interaction
 * holder (interaction.ts) and fed by whichever turn executor owns the session
 * (session/exec-turn.ts, turn/turn-session.ts): the backend's assistant
 * message-start signal (`HarnessSession.subscribeAssistantMessageStart`) and
 * the wire stream's text deltas.
 *
 * The offer tools (`suggest_actions`, `suggest_reusable`) read them to end the
 * turn on their own result — the reply and the offers then come from ONE
 * model pass — and the Claude backend's PostToolBatch hook reads the ended
 * mark to stop the subprocess (backends/claude/turn-end-hook.ts).
 */
export class TurnFinishMarks {
  /**
   * Whether the assistant message now streaming (or whose tool batch is now
   * executing) has visible text. A message's text always streams before its
   * tool calls run, so a tool can ask whether the model already wrote its
   * closing message IN THIS MESSAGE — text from an earlier round-trip of the
   * same turn never counts.
   */
  closingMessageSeen = false;
  /** Set by the tool that ended the turn (an offer after the closing
   *  message): both backends then stop calling the model. */
  turnEndedByTool = false;
  /**
   * Whether an assistant message-start has been seen. Text only counts once
   * the backend reports message boundaries: a backend without the signal
   * (a test fake) leaves the mark permanently unset, so a tool can never end
   * a turn on text it cannot attribute to the current message.
   */
  private inAssistantMessage = false;

  /** A model round-trip begins: the closing-message mark starts over. */
  noteAssistantMessageStart(): void {
    this.inAssistantMessage = true;
    this.closingMessageSeen = false;
  }

  /** Note a streamed assistant text delta. Whitespace-only deltas (block
   *  separators) are not a message. */
  noteAssistantText(delta: string): void {
    if (this.inAssistantMessage && /\S/.test(delta))
      this.closingMessageSeen = true;
  }
}
