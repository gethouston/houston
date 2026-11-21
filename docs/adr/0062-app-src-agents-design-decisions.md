# app/src/agents: design decisions

Covers `app/src/agents/`: the built-in agent templates and their labels. File paths in this record are relative to `app/src/`.

## Built-in template payloads load lazily

CLAUDE.md and the seed file map for each template are generated into `store-templates/<id>.json` and loaded on demand by id and locale.

Lives in `agents/builtin/store-template-loader.ts`.

## First-party agents are localized by author

Agents authored by Houston ship translations; others render their own strings.

Lives in `agents/catalog-labels.ts`.
