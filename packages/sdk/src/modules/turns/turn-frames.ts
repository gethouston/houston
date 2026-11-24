import type { WireFrame } from "@houston/runtime-client";
import { noteReplyPhase } from "./reply-phase";
import { finishSetupError, timeLimitNotice } from "./turn-notices";
import {
  finishErr,
  finishOk,
  push,
  settleProviderErrorCard,
  type TurnState,
} from "./turn-settle";
import { pushFilesNotSaved } from "./turn-unsaved-notice";

export function applyTurnFrame(
  s: TurnState,
  ev: WireFrame,
  stop: () => void,
): void {
  noteReplyPhase(s, ev);
  switch (ev.type) {
    case "text":
      s.text += ev.data;
      push(s, { feed_type: "assistant_text_streaming", data: s.text });
      break;
    case "thinking":
      s.thinking += ev.data;
      push(s, { feed_type: "thinking_streaming", data: s.thinking });
      break;
    case "tool_start":
      push(s, {
        feed_type: "tool_call",
        data: { name: ev.data.name, input: ev.data.args },
        toolIndex: s.toolsSeen,
      });
      s.toolsSeen++;
      break;
    case "tool_end":
      push(s, {
        feed_type: "tool_result",
        data: {
          name: ev.data.name,
          content: ev.data.content ?? "",
          is_error: ev.data.isError,
          ...(ev.data.mission ? { mission: ev.data.mission } : {}),
        },
        toolIndex: s.toolResultsSeen,
      });
      s.toolResultsSeen++;
      break;
    case "usage":
      s.usage = ev.data;
      break;
    case "provider_switched":
      push(s, {
        feed_type: "provider_switched",
        data: {
          provider: ev.data.provider,
          summarized: ev.data.summarized,
          pre_tokens: ev.data.pre_tokens,
        },
      });
      break;
    case "context_compacted":
      push(s, { feed_type: "context_compacted", data: ev.data });
      break;
    case "context_cleared":
      push(s, { feed_type: "context_cleared", data: null });
      break;
    case "file_changes":
      push(s, { feed_type: "file_changes", data: ev.data });
      break;
    case "provider_error":
      settleProviderErrorCard(s, ev.data);
      stop();
      break;
    case "error": {
      const notice = timeLimitNotice(ev.data.code);
      if (notice) finishOk(s, notice);
      else if (!finishSetupError(s, ev.data)) finishErr(s, ev.data.message);
      pushFilesNotSaved(s, ev.data);
      stop();
      break;
    }
    case "done":
      if (ev.pendingInteraction) s.pendingInteraction = ev.pendingInteraction;
      finishOk(s);
      pushFilesNotSaved(s, ev.data);
      stop();
      break;
    case "reply_complete":
      break;
    case "sync":
    case "user":
      break;
  }
}
