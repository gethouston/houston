# Inventory changelog

Every `version` bump in `inventory.yaml` needs a matching entry here (enforced by
`pnpm check:parity`). Newest first. Use `## vN` headings.

## v3 - 2026-07-05

Add `agent-provisioning-card` (HOU-693): the in-chat notice (and its
tab-placeholder variant) shown while a just-created agent's hosted engine warms
up. Web ships it app/-locked (`app/src/components/shell/agent-provisioning-*`),
so it lands as `partial` -- extract before mobile.

## v2 - 2026-07-03

Add the AI models hub's reusable content components: `ai-provider-card`,
`ai-model-row`, and `ai-model-offer-row`. The hub is a new top-level marketplace
surface (browse hundreds of models, connect a provider) that will exist on native
mobile; its navigation shell is surface-specific idiom and stays uninventoried.
Web implements all three today but app/-locked (in `app/src/components/ai-hub/`,
not a shared `ui/` package), so they land as `partial` — extract before mobile.

## v1 - 2026-07-03

Initial cross-surface component inventory. 22 components derived from an audit of
the `ui/` packages, scoped to pieces that are genuinely cross-surface (will exist
on native iOS/Android). Establishes the structural-parity contract and the three
surface manifests.

Components: agent-avatar, agent-list-item, conversation-feed, assistant-message,
user-message, thinking-indicator, tool-call-chip, provider-error-card,
system-message, skill-invocation-message, composer, turn-status, progress-panel,
approval-surface, deliverable-card, mission-card, mission-board,
mission-status-chip, routine-row, skill-row, empty-state, toast.

Surfaces: web (enforced, inventoryVersion 1), ios + android (unenforced,
inventoryVersion 0, all not-started).
