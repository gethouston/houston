# @houston-ai/review

Code review and deliverables UI. Split-pane review interface with sidebar navigation, detail views, and deliverable acceptance workflow.

## Install

```bash
bun add @houston-ai/review
```

## Usage

```tsx
import { ReviewSplit } from "@houston-ai/review"

<ReviewSplit
  items={reviewItems}
  selectedId={selectedId}
  onSelect={setSelectedId}
  onApprove={(id) => approveDeliverable(id)}
  onReject={(id) => rejectDeliverable(id)}
/>
```

## Exports

- `ReviewSplit` -- master-detail split layout for review workflow
- `ReviewSidebar` -- navigable list of review items
- `ReviewDetailPanel` -- slide-in detail panel
- `ReviewDetail` -- full review content with markdown rendering
- `ReviewItem` -- single review item in the sidebar
- `ReviewEmpty` -- empty state placeholder
- `DeliverableCard` -- deliverable with accept/reject actions
- `UserFeedback` -- user feedback display component
- Types: `ReviewItemData`, `RunStatus`

## Peer Dependencies

- React 19+
- @houston-ai/core

---

Part of [Houston](../../README.md).
