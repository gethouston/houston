import { MessageResponse } from "@houston-ai/chat";

// Renders the updater's "What's new" release notes as markdown. Reuses the
// app's shared Streamdown renderer (the same `MessageResponse` already used for
// standalone markdown in try-done-screen.tsx) rather than pulling in a separate
// markdown library. Links need no onClick: the app-wide interceptor in App.tsx
// catches `<a href>` clicks and opens them in the system browser, and
// MessageResponse degrades to raw text if a render-time failure escapes.
//
// The class scope keeps the output compact and muted for the small card:
// headings shrink to body size and structural margins tighten so the notes
// read as a tight changelog, not a full chat message. Descendant selectors
// (specificity 0,1,1) reliably win over Streamdown's own element utilities
// (0,1,0).
//
// Verification: this render path is covered by `pnpm tsgo --noEmit` (types) and
// manual visual check. The app's `node --test` harness strips TS types but does
// NOT transform JSX, so a React component cannot be rendered there; only pure
// `.ts` logic is unit-testable. The input contract (what reaches this component)
// is guarded by the `selectUpdateNotes` / `normalizeUpdateNotes` tests in
// update-details.test.ts.
const COMPACT = [
  "text-xs leading-relaxed text-ink-muted",
  "[&_:is(h1,h2,h3,h4,h5,h6)]:mb-1 [&_:is(h1,h2,h3,h4,h5,h6)]:mt-2",
  "[&_:is(h1,h2,h3,h4,h5,h6)]:text-xs [&_:is(h1,h2,h3,h4,h5,h6)]:font-semibold",
  "[&_:is(h1,h2,h3,h4,h5,h6)]:text-ink",
  "[&_p]:my-1",
  // Streamdown renders ul/ol with `list-inside list-disc|list-decimal`, but
  // those utilities aren't generated for the app build (the package isn't in
  // Tailwind's @source and nothing in scanned source uses them), so the markers
  // fall back to outside position with zero padding and get clipped — the list
  // looked like plain lines. Style the lists explicitly in the card's own
  // compact scope: disc/decimal markers, outside position, and left padding so
  // the markers have room. Descendant selectors (0,1,1) win over Streamdown's
  // element utilities (0,1,0), so this holds even if the package is scanned later.
  "[&_:is(ul,ol)]:my-1 [&_:is(ul,ol)]:pl-5 [&_:is(ul,ol)]:list-outside",
  "[&_ul]:list-disc [&_ol]:list-decimal",
  "[&_li]:my-0.5 [&_li]:marker:text-ink-muted",
  "[&_a]:font-medium [&_a]:text-ink",
].join(" ");

export function UpdateNotes({ notes }: { notes: string }) {
  return <MessageResponse className={COMPACT}>{notes}</MessageResponse>;
}
