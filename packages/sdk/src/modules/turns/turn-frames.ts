import type { WireFrame } from "@houston/runtime-client";
import {
  finishErr,
  finishOk,
  push,
  settleProviderErrorCard,
  type TurnState,
} from "./turn-settle";

/**
 * Fold ONE of our turn's wire frames into the turn state + feed — content
 * accumulation and the terminal settles. Identity is already decided: the
 * sink calls this only for frames classified as OURS (`turn-identity.ts`);
 * `sync` and `user` never reach here.
 *
 * Provider ids are emitted as the engine's own ids (e.g. `openai-codex`); a
 * host that speaks a legacy provider dialect maps them in its FeedOutput.
 */
export function applyTurnFrame(
  s: TurnState,
  ev: WireFrame,
  stop: () => void,
): void {
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
      });
      break;
    case "tool_end":
      push(s, {
        feed_type: "tool_result",
        data: { content: "", is_error: ev.data.isError },
      });
      break;
    case "usage":
      // Stash the turn's usage; finishOk attaches it to the final_result.
      s.usage = ev.data;
      break;
    case "provider_switched":
      // Mid-turn provider switch: draw the boundary divider + reset the
      // context-usage window.
      push(s, {
        feed_type: "provider_switched",
        data: {
          provider: ev.data.provider,
          summarized: ev.data.summarized,
          pre_tokens: ev.data.pre_tokens,
        },
      });
      break;
    case "provider_error":
      settleProviderErrorCard(s, ev.data);
      stop();
      break;
    case "error":
      finishErr(s, ev.data.message);
      stop();
      break;
    case "done":
      finishOk(s);
      stop();
      break;
    case "sync":
    case "user":
      break; // handled by the sink before identity classification
  }
}
