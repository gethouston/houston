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
import { setActivityStatus } from "./activity-status";
import type { BaseCtor } from "./mixin";

export function ChatSendMixin<TBase extends BaseCtor>(Base: TBase) {
  class ChatSend extends Base {
    // ---- sessions / chat (send) ----
    async startSession(
      agentPath: string,
      req: SessionStartRequest,
    ): Promise<SessionStartResponse> {
      const path = agentPath || DEFAULT_AGENT_PATH;
      // In cloud mode, talk to this agent's sandbox through the SDK's own
      // per-agent client (the same one its turn modules use); locally, the
      // single runtime. Either way `streamTurn` is identical.
      const engine = this.ctx.cp
        ? this.ctx.sdk.clientFor(path)
        : this.ctx.engine;
      // Queue-while-running: a send into a conversation whose turn is still
      // streaming is held and flushed as ONE combined send at settle (see
      // send-queue.ts). Every send path inherits this here. The dispatch
      // callback serves the queue's settle watcher — the flush path for turns
      // settled by an observer or the stale-running heal, which never pass
      // through the `.finally` below. The history probe backs the queue
      // watchdog, the ground-truth flush trigger for a hold whose observer
      // stream died silently (HOU-849).
      const redispatch = (r: SessionStartRequest) => {
        void this.startSession(path, r);
      };
      const probe = async () =>
        (await engine.getHistory(req.sessionKey)).messages;
      if (maybeQueueSend(path, req, redispatch, probe)) {
        // The VM says a turn is running, but nothing may actually be streaming
        // it (a `running` flag left behind by a torn-down stream). Attach the
        // passive observer so the SERVER arbitrates: a genuinely running turn
        // renders live and settles the queue when it ends; an idle conversation
        // heals the flag (`confirmIdle`), which fires the settle watcher and
        // flushes the held send immediately. No-op while a live turn/observer
        // already owns this conversation.
        observeConversation(
          engine,
          path,
          req.sessionKey,
          (status, pendingInteraction) =>
            setActivityStatus(
              this.ctx,
              path,
              req.sessionKey,
              status,
              pendingInteraction,
            ),
          0,
        );
        return { sessionKey: req.sessionKey };
      }
      // Fire-and-stream: events flow to the feed store over the bus/WS adapter.
      // The board-status setter is cloud-aware (writes land where the board reads).
      // The request's provider/model/effort (the chat's OWN pick, app dialect)
      // ride the send as a per-turn wire pin in engine ids (wireTurnPin), so the
      // turn runs on this conversation's provider — not the agent-wide settings
      // some other chat or connect flow last wrote (HOU-695).
      // A dispatched auto-resume is bracketed so a duplicate resume (another
      // mounted reconnect card, same login event) is swallowed while it runs.
      if (req.autoResume) noteAutoResumeStarted(path, req.sessionKey);
      void streamTurn(
        engine,
        path,
        req.sessionKey,
        req.prompt,
        (status, pendingInteraction) =>
          setActivityStatus(
            this.ctx,
            path,
            req.sessionKey,
            status,
            pendingInteraction,
          ),
        {
          provider: req.provider,
          suppressUserBubble: req.suppressUserBubble,
          pin: wireTurnPin(req),
          displayText: req.displayText,
          author: req.author,
          mentions: req.mentions,
          // Receipts for the approval cards this message answers. Wire
          // passengers: only the HOST reads them (routes/agents.ts), and it
          // drops them before the runtime sees the turn.
          approvals: req.approvals,
        },
      ).finally(() => {
        // The turn settled (or failed): release anything queued behind it.
        if (req.autoResume) noteAutoResumeEnded(path, req.sessionKey);
        flushQueuedSends(path, req.sessionKey, redispatch);
      });
      return { sessionKey: req.sessionKey };
    }

    /** Drop one queued (not yet sent) message from a conversation's send queue. */
    removeQueuedMessage(
      agentPath: string,
      sessionKey: string,
      id: string,
    ): void {
      removeQueuedSend(agentPath || DEFAULT_AGENT_PATH, sessionKey, id);
    }
  }
  return ChatSend;
}
