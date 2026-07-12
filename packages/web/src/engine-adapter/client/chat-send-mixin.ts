import type {
  SessionStartRequest,
  SessionStartResponse,
} from "../../../../../ui/engine-client/src/types";
import * as controlPlane from "../control-plane";
import {
  flushQueuedSends,
  maybeQueueSend,
  removeQueuedSend,
} from "../send-queue";
import { DEFAULT_AGENT_PATH, wireTurnPin } from "../synthetic";
import { streamTurn } from "../turn-stream";
import { setActivityStatus } from "./activity-status";
import type { BaseCtor } from "./mixin";

export function ChatSendMixin<TBase extends BaseCtor>(Base: TBase) {
  class ChatSend extends Base {
    // ---- sessions / chat (send + cancel) ----
    async startSession(
      agentPath: string,
      req: SessionStartRequest,
    ): Promise<SessionStartResponse> {
      const path = agentPath || DEFAULT_AGENT_PATH;
      // In cloud mode, talk to this agent's sandbox via the control plane's proxy;
      // locally, the single runtime. Either way `streamTurn` is identical.
      const engine = this.ctx.cp
        ? controlPlane.runtimeClientFor(this.ctx.cp, path)
        : this.ctx.engine;
      // Queue-while-running: a send into a conversation whose turn is still
      // streaming is held and flushed as ONE combined send at settle (see
      // send-queue.ts). Every send path inherits this here.
      if (maybeQueueSend(path, req)) return { sessionKey: req.sessionKey };
      // Fire-and-stream: events flow to the feed store over the bus/WS adapter.
      // The board-status setter is cloud-aware (writes land where the board reads).
      // The request's provider/model/effort (the chat's OWN pick, app dialect)
      // ride the send as a per-turn wire pin in engine ids (wireTurnPin), so the
      // turn runs on this conversation's provider — not the agent-wide settings
      // some other chat or connect flow last wrote (HOU-695).
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
        req.provider,
        undefined,
        req.suppressUserBubble,
        wireTurnPin(req),
        req.displayText,
      ).finally(() => {
        // The turn settled (or failed): release anything queued behind it.
        flushQueuedSends(path, req.sessionKey, (r) => {
          void this.startSession(path, r);
        });
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

    async cancelSession(agentPath: string, sessionKey: string) {
      const engine = this.ctx.cp
        ? controlPlane.runtimeClientFor(this.ctx.cp, agentPath)
        : this.ctx.engine;
      // Abort the agent's in-flight turn. The engine reports whether a turn was
      // ACTUALLY in flight. `false` means there was nothing to abort: the turn is
      // orphaned — its board card is stuck "running" because the turn died without
      // settling (an error that never reached a terminal frame, or an app restart
      // that dropped the in-memory turn). Stop is the user's escape hatch, so in
      // that case settle the card ourselves. A genuinely live turn (`true`) is
      // settled by its own `streamTurn` when the abort lands, so we leave its
      // status alone — writing it here too would race that terminal write.
      const { cancelled } = await engine.cancel(sessionKey);
      if (cancelled !== true) {
        // Orphan rescue: a user Stop on a dead turn — never a pending interaction.
        await setActivityStatus(
          this.ctx,
          agentPath,
          sessionKey,
          "needs_you",
          null,
        );
      }
      return { cancelled: cancelled === true };
    }

    async dismissInteraction(
      agentPath: string,
      conversationId: string,
    ): Promise<void> {
      const engine = this.ctx.cp
        ? controlPlane.runtimeClientFor(this.ctx.cp, agentPath)
        : this.ctx.engine;
      // The stepper X / abandon appends the durable stop marker on the runtime,
      // retiring the pending interaction. This matches a real Stop — the model
      // learns nothing from it.
      await engine.dismissInteraction(conversationId);
    }

    async startOnboarding(
      _agentPath: string,
      sessionKey: string,
    ): Promise<SessionStartResponse> {
      return { sessionKey };
    }
  }
  return ChatSend;
}
