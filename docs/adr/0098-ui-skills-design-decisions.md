# ui/skills: design decisions

Covers `ui/skills/` (`@houston-ai/skills`): skill workflow steps, action names and the editable title.

## Workflow steps

A Houston-authored skill renders as its numbered procedure rather than its SKILL.md markdown; imported skills have no parsed steps and render nothing here. Resolving a toolkit slug to an app name and logo is an app concern, so `renderIntegration` is optional and the fallback chip shows the slug plus the action's plain name. The chip wraps under a long title rather than scrolling sideways. Keys include an occurrence count because a skill can repeat a step verbatim. Lives in `ui/skills/src/skill-workflow-steps.tsx`.

## Action names

Action slugs such as `GMAIL_SEND_EMAIL` are machine vocabulary; the toolkit prefix is dropped because the app is shown beside it, using the shared `actionWordsWithoutToolkit` so this chip and chat's rows agree. A slug that is only the toolkit keeps every word, since repeating the app beats naming no action. Lives in `ui/skills/src/integration-action.ts`.

## Editable title

The rename pencil swaps the title for an input; Enter or blur commits the trimmed name, unchanged or empty commits cancel, Escape cancels, and a ref stops the blur from resurrecting a discarded draft. The heading stays mounted (visually hidden) so the page keeps its accessible name; it is `h1` by default and `h2` inside a frame that already has one, since two `h1`s confuse screen-reader users. Persistence is the caller's. Lives in `ui/skills/src/skill-title-editor.tsx`.
