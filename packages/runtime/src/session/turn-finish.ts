import { isOfferToolName } from "@houston/protocol";
import type { ReplyBeat } from "../backends/types";

export class TurnFinishMarks {
  closingMessageSeen = false;
  visibleText = "";
  turnEndedByTool = false;
  private inAssistantMessage = false;
  private replyCompleted = false;

  noteAssistantMessageStart(): void {
    this.inAssistantMessage = true;
    this.closingMessageSeen = false;
  }

  noteAssistantText(delta: string): void {
    this.visibleText += delta;
    if (this.inAssistantMessage && /\S/.test(delta))
      this.closingMessageSeen = true;
  }

  noteReplyBeat(beat: ReplyBeat): boolean {
    if (this.replyCompleted || !this.closingMessageSeen) return false;
    if (beat.type === "tool_call_start" && !isOfferToolName(beat.name))
      return false;
    this.replyCompleted = true;
    return true;
  }
}
