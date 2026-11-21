# app/src/components/cards: design decisions

Covers `app/src/components/cards/`: the shared inline row card used by feed and integration surfaces. File paths in this record are relative to that folder.

## RowCard is the single inline card shape

One component for feed cards and integration surfaces: logo left, title and description middle, one action slot right. `inline` renders as a span row that sits inside assistant markdown prose. `md` size is for the provider-switch dialog heading. Body text uses `text-ink/70` because the muted token is too low contrast on the grey slab. The `surface` prop inverts the slab against its parent (`bg-chip` parent gets a `bg-input` slab with a hairline border) so it never goes tone-on-tone.

Lives in `app/src/components/cards/row-card.tsx`.

## RowCardButton is text-first and rage-click safe

Decorative glyphs are stripped by default; `icon` is optional for the sign-in card's trailing link icon. It is built on `AsyncButton`: returning a promise from `onClick` disables the button until it settles, so callers must return the promise. The prop is typed `unknown` so sync and async handlers share it without Biome's confusing-void-union rule; a sync result is normalized to `undefined`. `loading` covers pending state that lives outside the click, and AsyncButton's own spinner is off to keep spinner placement consistent.

Lives in `row-card-button.tsx`.

## One report-bug button

Every user-visible failure that offers a report uses `ReportBugButton`: one payload shape, one pending look, one pair of result toasts, one delivery rule (`submitBugReport` with its fallback). A copied version is how one surface silently stops sending logs. `command` is a flat snake_case triage tag, never composed per instance, so one issue does not fan out into unbounded Sentry groups. Only the case where every channel failed earns a "try again"; a throw from the submit path itself is still reported.

Lives in `report-bug-button.tsx`.
