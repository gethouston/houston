# Houston Academy

**From zero to hero:** a free, open-source program, in English and Spanish, that teaches non-technical people to plan, build and run production-grade software by steering AI agents. The agent writes the code. The Academy teaches everything around it.

- **The plan:** [`PLAN.md`](PLAN.md): who it's for, the program, the format, the build plan. Research notes are in [`research/`](research/).
- **Status:** milestone M1, the pilot. Course 0 is complete, and Courses 1 and 2 have their first lessons, all in both languages.
- **Live at:** `academy.gethouston.ai` (once the domain is connected; see `pilot/README.md`).

## What's here

| Path | What it is |
|---|---|
| `site/` | The course site: Astro + Starlight. English at `/`, Spanish at `/es/`. Lessons are MDX files in `site/src/content/docs/` |
| `site/src/components/` | Lesson building blocks: interactive diagrams, prompt cards, checklists, illustrative agent sessions, explain-back questions |
| `plugin/` | The **academy** Claude Code plugin: the tutor that runs inside the learner's own project. It's listed in the repo's marketplace (`/.claude-plugin/marketplace.json`) |
| `series/` | Scripts for the video series, recorded natively in both languages |
| `pilot/` | The M1 pilot: test plan, observation sheet, invite drafts |

## Run the site

```bash
cd academy/site
npm install
npm run dev            # http://localhost:4321
npm run check:locales  # every page must exist in English and Spanish
npm run build
```

`.github/workflows/academy.yml` runs the build, the locale check and the plugin's hook tests on every PR that touches `academy/`, and deploys the site to Firebase Hosting (site `gethouston-academy`) when they land on `main`.

## Install the tutor

In a Claude Code session (the terminal or the desktop app's Code tab):

```
/plugin install academy --marketplace gethouston/houston
```

Then, in the learner's project folder, run `/academy:start 0`.

The tutor's skills are `/academy:start`, `/academy:brief`, `/academy:explain` and `/academy:check`. Its red-flag hooks only act in folders that have an `.academy/` directory, which `/academy:start` creates. Test them with `academy/plugin/tests/test-hooks.sh`.

## Writing lessons

- Every lesson ships in **both languages or not at all** (`npm run check:locales`). Spanish is written natively, in neutral Latin American Spanish with *tú*. Terms follow the [glossary](site/src/content/docs/glossary.mdx).
- Every lesson has the same anatomy: the picture, **tell** (prompt cards), **watch**, a 🚩 red flag, **done when**, and **explain it back**.
- Never ask the learner to write or read code.

## License

Code is MIT, like the rest of this repo. Course content is CC BY-SA 4.0 ([`LICENSE-CONTENT.md`](LICENSE-CONTENT.md)).
