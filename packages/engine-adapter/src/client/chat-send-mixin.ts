import type {
  SessionStartRequest,
  SessionStartResponse,
} from "@houston/wire-types";
import {
  flushQueuedSends,
  maybeQueueSend,
  noteAutoResumeEnded,
  noteAutoResumeStarted,
  removeQueuedSend,
} from "../send-queue";
import { DEFAULT_AGENT_PATH } from "../synthetic";
import { wireTurnPin } from "../turn-pin";
import { observeConversation, streamTurn } from "../turn-stream";
import { turnCardWriter } from "./activity-status";
import type { BaseCtor } from "./mixin";

export function ChatSendMixin<TBase extends BaseCtor>(Base: TBase) {
  class ChatSend extends Base {
    async startSession(
      agentPath: string,
      req: SessionStartRequest,
    ): Promise<SessionStartResponse> {
      const path = agentPath || DEFAULT_AGENT_PATH;
      const engine = this.ctx.cp
        ? this.ctx.sdk.clientFor(path)
        : this.ctx.engine;
      const redispatch = (r: SessionStartRequest) => {
        void this.startSession(path, r);
      };
      const probe = async () =>
        (await engine.getHistory(req.sessionKey)).messages;
      if (maybeQueueSend(path, req, redispatch, probe)) {
        observeConversation(
          engine,
          path,
          req.sessionKey,
          turnCardWriter(this.ctx, path, req.sessionKey),
          0,
        );
        return { sessionKey: req.sessionKey };
      }
      if (req.autoResume) noteAutoResumeStarted(path, req.sessionKey);
      const citations = this.ctx.sdk.citations;
      void streamTurn(
        engine,
        path,
        req.sessionKey,
        req.prompt,
        turnCardWriter(this.ctx, path, req.sessionKey),
        {
          provider: req.provider,
          suppressUserBubble: req.suppressUserBubble,
          pin: wireTurnPin(req),
          displayText: req.displayText,
          author: req.author,
          mentions: req.mentions,
          approvals: req.approvals,
          missionTitle: req.missionTitle,
          grants: req.grants,
          onAccepted: () => citations.accept(req.prompt),
        },
      ).finally(() => {
        citations.release(req.prompt);
        if (req.autoResume) noteAutoResumeEnded(path, req.sessionKey);
        flushQueuedSends(path, req.sessionKey, redispatch);
      });
      return { sessionKey: req.sessionKey };
    }

    removeQueuedMessage(
      agentPath: string,
      sessionKey: string,
      id: string,
    ): void {
      const removed = removeQueuedSend(
        agentPath || DEFAULT_AGENT_PATH,
        sessionKey,
        id,
      );
      if (removed) this.ctx.sdk.citations.release(removed.prompt);
    }
  }
  return ChatSend;
}
