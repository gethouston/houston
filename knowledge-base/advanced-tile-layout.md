# Advanced: Tile Layout

`advanced.tile_layout` — Phase 6 of RFC #248. Splits the chat tab into two
horizontal panes when the user opts in.

Default: **off**. UI-only. Status: **beta**. Graduation target: **permanent**.

## What it does

When on, the chat tab renders inside an `@houston-ai/layout` `<SplitView>`:

| Pane  | Width | Content |
| ----- | ----- | ------- |
| Left  | 55%   | The familiar `<ChatPanel>` (full feed, composer, footer). |
| Right | 45%   | `<FocusedAssistantPane>` — the most recent assistant text in a larger, scrollable reader. |

The divider is draggable; min sizes 30% (left) / 25% (right).

When the flag is off, the chat tab renders the `ChatPanel` full-bleed exactly
like before. Zero visual change.

## Why it exists

Power users running long planning sessions want to keep reading the latest
answer while scrolling back through earlier messages in the same conversation.
The standard single-pane chat fights that workflow — every scroll jumps you
away from the content you're trying to read.

This is a small first step toward multi-pane chat. v1 only mirrors the most
recent `assistant_text` / `assistant_text_streaming` entry as plain text. v2
will likely add a richer renderer (markdown, code-blocks, tool-call cards),
pinning of a specific message, and possibly a third pane for file / tool
inspection.

## Files touched

- `app/src/lib/featureFlags.ts` — `FLAG_REGISTRY["advanced.tile_layout"]`.
- `app/src/components/tile/focused-assistant-pane.tsx` — the right pane.
- `app/src/components/tabs/chat-tab.tsx` — flag read + `<SplitView>` wrap.
- `app/src/locales/{en,es,pt}/tile.json` — new namespace for the pane.
- `app/src/locales/{en,es,pt}/settings.json` — flag label + description.
- `app/src/lib/i18n.ts` + `app/src/types/react-i18next.d.ts` — namespace registration.
- `app/tests/feature-flags.test.ts` — registry shape test.

No engine changes. No new domain model. The pane is a pure projection of the
existing chat feed.

## Wire shape

`<FocusedAssistantPane>` takes the same `FeedItem[]` the chat panel renders and
walks it from the end picking the latest non-empty `assistant_text` or
`assistant_text_streaming` entry. Streaming text updates in place as the
streaming entry's `data` grows.

```tsx
<SplitView
  left={renderChatPanel()}
  right={<FocusedAssistantPane feedItems={visibleFeedItems} />}
/>
```

## Known limits (v1)

- Plain text only. No markdown / code-block / tool-call rendering. Long
  answers in the right pane will look more compact than they do in the chat.
- No pinning. The pane always reflects the latest assistant message; there's
  no way yet to lock it onto a specific earlier turn.
- Only assistant text. Tool calls, system messages, and the user's own
  messages don't appear in the right pane.
- Single agent / single session. Two chat tabs in two windows each get their
  own split; we do not mirror across windows.

These are deliberate v1 scope cuts. They keep the diff small and the behavior
provable while we learn what the flag is actually used for.
