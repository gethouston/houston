# @houston-ai/chat

Full-featured AI chat interface. Streaming markdown, grouped technical details, prompt input -- one component or pick individual pieces.

## Install

```bash
bun add @houston-ai/chat
```

## Usage

```tsx
import { ChatPanel } from "@houston-ai/chat"
import "@houston-ai/chat/src/styles.css"

<ChatPanel
  sessionKey={session.id}
  feedItems={feedItems}
  onSend={(text) => sendMessage(text)}
  onStop={() => stopSession()}
  isLoading={isStreaming}
/>
```

## Exports

**Top-level:** ChatPanel, ChatInput, ToolActivity, ToolsAndCards, Typewriter, feedItemsToMessages

**AI Elements:** Conversation, ConversationContent, ConversationScrollButton, Message, MessageContent, MessageResponse, MessageToolbar, Reasoning, ReasoningTrigger, ReasoningContent, PromptInput (with 30+ sub-components), Shimmer, Suggestions

**Types:** FeedItem, RunStatus, ChatMessage, ToolEntry

## How it works

`ChatPanel` accepts an array of `FeedItem` discriminated unions (user messages, assistant text, thinking, tool calls, tool results, runtime errors, final results) and renders the full conversation. Status is derived automatically from the feed, or you can override it.

Thinking and tool activity are grouped into a single technical-details accordion per assistant turn. The active group stays open while work is happening, then collapses when the assistant returns user-facing text or the session becomes ready.

Markdown code fences and tool output blocks render visible copy controls. Copy uses the async Clipboard API with a WebView-safe fallback so code and Bash output remain copyable in desktop builds.

The AI Elements are composable -- use `ChatPanel` for the batteries-included experience, or build your own layout with the primitives.

## Peer Dependencies

- React 19+
- @houston-ai/core

---

Part of [Houston](../../README.md).
