# @houston-ai/skills

Skills management UI backed by Houston skill files. Browse installed skills, preview one in detail, and add skills from a GitHub repository or from scratch.

## Install

```bash
pnpm add @houston-ai/skills
```

## Usage

```tsx
import { SkillRow } from "@houston-ai/skills"

{installedSkills.map((skill) => (
  <SkillRow
    key={skill.id}
    skill={skill}
    onClick={() => navigate(`/skills/${skill.id}`)}
  />
))}
```

## Exports

- `SkillRow` -- single skill row with name, description, icon
- `AddSkillDialog` -- the Add Skill dialog (GitHub / From scratch tabs)
- `SkillEditModal` -- the installed skill's editor
- `SkillPreviewModal` -- overlay detail modal for a skill the user can add
- `SkillOwnerAvatar` -- the owner mark a preview carries
- `EditableSkillTitle` -- the rename-in-place heading a skill surface titles itself with
- `SkillWorkflowSteps` -- a skill's parsed procedure, step by step
- `SkillInstructionsDisclosure` -- the fold that reveals a skill's raw instructions
- `humanizeIntegrationAction` -- a workflow step's connected-app action, read as a sentence
- `deriveInstalledSkillEditorState` -- the collapsed/loading/ready/error state of an inline editor
- `toSlug` -- the install slug a from-scratch title becomes
- Types: `Skill`, `PreviewSkill`, `PreviewSkillDetail`, `RepoSkill`, `SkillStepIntegration`, `SkillWorkflowStepItem`

## Peer Dependencies

- React 19+
- @houston-ai/core

---

Part of [Houston](../../README.md).
