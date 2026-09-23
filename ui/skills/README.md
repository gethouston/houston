# @houston-ai/skills

Skills UI backed by Houston skill files. Title a skill in place, and read a Houston-written skill as the procedure it is.

## Install

```bash
pnpm add @houston-ai/skills
```

## Usage

```tsx
import { EditableSkillTitle } from "@houston-ai/skills"

<EditableSkillTitle title={title} onRename={rename} />
```

## Exports

- `EditableSkillTitle` -- the rename-in-place heading a skill surface titles itself with
- `SkillWorkflowSteps` -- a skill's parsed procedure, step by step
- `humanizeIntegrationAction` -- a workflow step's connected-app action, read as a sentence
- Types: `SkillStepIntegration`, `SkillWorkflowStepItem`

## Peer Dependencies

- React 19+
- @houston-ai/core

---

Part of [Houston](../../README.md).
