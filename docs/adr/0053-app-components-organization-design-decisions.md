# app/src/components/organization: design decisions

Covers `app/src/components/organization/`: the Admin screen: org chart, People, Billing, Activity and sharing. File paths in this record are relative to that folder.

## Admin is a kept-alive shell

Admin (Org chart, People, Billing when `canSeeBillingTab`, Activity) is mounted behind `canSeeOrganization` (multiplayer owner/admin, or a Spaces personal space) and kept alive. Section pins from outside (the team-status banner, an errand card) arrive through `org-nav-store` and are consumed by an effect on the store field, so they land on first mount and while already open; the Billing pin waits for the org's billing, which decides whether the section exists. If the visible set drops the active section, the view falls back to the landing section. Section analytics fire only on a section opened below the shell's `tab_opened`, so they never double count. Per-agent policy lives on each employee's Settings, not here. Company context is a header tool opening a sheet over any section; the sheet root sits above the header tools slot (which remounts at its width threshold) so the editor keeps its instance, and the editor mounts only while open, flushing a pending save on close.

Lives in `app/src/components/organization/organization-view.tsx`, `org-view-model.ts`, `org-nav-store.ts`, `company-context-tool.tsx`, `company-context-sheet.tsx`.

## Header threshold

The Admin strip switches at 720px, derived from Spanish: lozenges about 450px, zone gap 12, the Company context pill about 202, padding 40, totalling 704 rounded up. On phones the cluster collapses into the identity switcher, which names every section including Org chart.

Lives in `admin-header.tsx`.

## Org tree placement

Every owner manages every agent, so "who manages it" cannot place an agent. An agent's home is the person explicitly assigned to manage it (by name when several match), else its one user, else the first owner; agents whose people the caller cannot see go under the first owner. A personal space is one person over every AI Employee. Capped rows keep owners first, then people with AI Employees, so the sharer is never cut and nobody with employees is dropped for someone without.

Lives in `org-chart-tree.ts`, `org-chart-home.ts`, `org-chart-share-model.ts`.

## Managers and users

The gateway manages by role: every owner manages every agent, and a manager assignment counts only while its member is still an admin. Ids not on the roster are left out. Assignments are sent only to an agent's managers and an empty list is omitted, so a managed agent with neither field is shared with everyone; a host without access levels signals only by field presence. When the caller cannot see assignments the chart says "People hidden" rather than an empty list.

Lives in `org-chart-people.ts`, `org-chart-line-people.tsx`.

## Usage window and honest numbers

Every figure counts the same 30 UTC days its series draws. Days are UTC because usage rows are bucketed by UTC day; a local window would shift buckets around midnight, and labels are pinned to UTC for the same reason. A row dated in the future counts as today. Unknown slugs are never counted. Time worked is `activeMs`; `awakeMs` is never counted. Time worked is queried only where the gateway advertises it; message usage only for owners and admins. Queries park while Admin is off screen, and an unlanded read stays `loading`, so nothing is drawn from data that is not there. Hours lead when readable (holding a skeleton rather than flashing messages first); otherwise messages lead; with neither, no figure. A failed read shows one retry line, never zeros. Owners see the org; others are scoped to their own AI Employees, and partial message counts say they cover managed agents only. The ledger holds a skeleton while ranking data loads so order never reshuffles.

Lives in `org-chart-model.ts`, `org-chart-view-model.ts`, `org-chart-scope.ts`, `use-org-chart-data.ts`, `org-chart-ledger.tsx`, `org-chart-retry-line.tsx`, `org-chart-format.ts`.

## Number formatting

Digits are grouped with U+202F (SI style) so the grouping reads the same in every shipped language, with the locale's decimal mark. Time worked shows minutes under an hour, one decimal under ten hours, whole hours above.

Lives in `org-chart-format.ts`.

## Connectors

On-screen chart and share image both hand node boxes to one path module, so lines have the same shape everywhere and always end on nodes. All edges are one path so shared trunks are painted once. Lines are measured after layout and on resize, from an element the frame owns (a child's layout effect runs before the parent's ref attaches), using `offsetLeft`/`offsetTop` so mid-reveal transforms are ignored. The reveal runs once on first layout because Admin is kept alive and re-renders on refresh; connectors fade in across the stagger so no line reaches an unarrived card.

Lives in `org-chart-tree-paths.ts`, `org-chart-tree-connectors.tsx`, `use-reveal-once.ts`.

## Sideways scroll

A chart wider than the screen opens on its left edge (owners first) and fades the hiding sides with an alpha mask, because overlay scrollbars only show while scrolling. Measures read 0 while Admin is hidden; a ResizeObserver catches the first real size.

Lives in `org-chart-scroll-edges.ts`, `use-scroll-edges.ts`, `org-chart-tree-view.tsx`.

## Share image rendering

Drawn with Canvas 2D only, because WebKit (the desktop WKWebView) taints any canvas that draws html-to-image or SVG foreignObject output and the PNG could not be read back. Photos load with `crossOrigin="anonymous"` and are test-drawn on a scratch canvas; a tainting or slow photo becomes initials. The canvas cannot read CSS variables, so the image's paper, ink and shadows are authored hex (the sanctioned exception); employees keep their token colors, resolved against the light theme. Shadows ignore the canvas transform and are scaled by hand. Text is cut and wrapped on `Intl.Segmenter` boundaries so emoji, accents and CJK survive.

Lives in `org-chart-share-card.ts`, `org-chart-share-card-art.ts`, `org-chart-share-card-marks.ts`, `org-chart-share-card-text.ts`.

## Share image geometry

4:5 portrait at 1200x1500, the tallest image LinkedIn's feed shows whole. Minimum type sizes keep names readable when LinkedIn shows the image about 550px wide; charts that would need smaller type show "+N" via caps (four people with four employees each, or six personal employees). Five to seven unstacked columns wrap onto two offset lines. Small teams zoom up to fill the frame. The image is drawn ahead of the click and redrawn only when the tree changes; `useStableByContent` keeps the tree identity across identical reloads (the agent store hands out fresh arrays). Posts send the PNG unless it exceeds LinkedIn's cap, then a JPEG; clipboard and download keep PNG.

Lives in `org-chart-share-card-geometry.ts`, `org-chart-share-columns.ts`, `org-chart-share-layout.ts`, `use-share-card-image.ts`, `use-stable-by-content.ts`, `org-chart-share-encode.ts`.

## Share routes

`sheet` on touch devices whose share sheet takes files; `post` where the deployment advertises `linkedinShare` (never in the native mobile apps, since connect would need a `houston://` return, a native change that strands installs on old OTA bundles); `paste` everywhere else. Detection is capability based, never platform sniffing. Copy and paste also stands in when the connection cannot be read. A share sheet rejection that is the user closing it, or a second tap while open, is not a failure.

Lives in `org-chart-share-run.ts`, `org-chart-share-step.ts`, `org-chart-share-browser.ts`.

## Work inside the click

Safari only allows a clipboard write or a new tab while the click is being handled, so nothing is awaited before either; the clipboard write takes the image as a promise and starts first because opening a tab steals focus. A browser-refused clipboard write is the person's setup and is not reported. Opening LinkedIn is gated to one at a time plus a cooldown, because an open settles in a microtask and a double click opened two composers. Connect also runs in the click; a double click minted two states and the gateway keeps only the last, so it is checked before claiming a tab.

Lives in `org-chart-share-paste.ts`, `org-chart-share-copy.ts`, `org-chart-share-gate.ts`, `use-linkedin-connect.ts`, `use-org-chart-share.ts`.

## LinkedIn posts outlive the page

The gateway finishes a post even after the person navigates away, so post state lives in a store keyed by person and space (every personal space shares an id). A post in flight shows Posting on return, never a second Post. A post that went up while the page was gone is said in the next opening. A post that may be up (no answer in time) holds Post in every opening until the person confirms they checked LinkedIn, so it is never retried blind. A post prepared under one identity is never sent under another; on identity change, slots go except those with a post out or held. Each opening is a session, and results tagged with a stale session are dropped. The post is opened automatically only if the same opening is still on screen, and never where the browser would warn. Pre-filled post text is allowed by LinkedIn's API terms only beside the privacy notice.

Lives in `linkedin-post-store.ts`, `linkedin-post-run.ts`, `linkedin-post-open.ts`, `use-linkedin-post.ts`, `org-chart-share-state.ts`, `org-chart-share-dialog.tsx`.

## Motion

Press feedback sets only timing because Tailwind 4 compiles `active:scale-*` to the CSS `scale` property and naming properties would override the class's transition list; buttons whose paint also changes name the press properties too. Label swaps blur-bridge because the old label is already gone. Reveal is 40ms per node with a cap past which the rest arrive together. SVG `url(#id)` references break on React id punctuation, so ids are sanitized.

Lives in `org-chart-motion.ts`, `org-chart-area-chart.tsx`, `use-swap-in.ts`.

## People: naming

One rule names a person everywhere: their set name, else the email the gateway exposes, else a surface stand-in; never a raw id. A whitespace-only name counts as absent. A row uses one name for its visible line and its controls' labels.

Lives in `people-tab-model.ts`, `org-roster.ts`.

## People: editing rules

Owners edit other rows, including other owners, never themselves. The gateway's `last_owner` 409 is the floor and surfaces as an informational toast. Two actions are confirm-gated: removing anyone (which also lists the routines that stop with them, without gating on that read) and granting owner. Role changes and removals are optimistic. Adding a known user adds them; an unknown email becomes a pending invite (202). Invites are revocable optimistically by owners. A locked org takes no one new but still removes. One shared `PersonRow` shell and trigger class keep every people list identical.

Lives in `people-tab-model.ts`, `people-roster.tsx`, `people-roster-confirm.tsx`, `people-remove-confirm.tsx`, `people-add-row.tsx`, `people-invites.tsx`, `members-tab.tsx`, `person-row.tsx`.

## Seats and billing

Adding someone re-reads the quote, then adds, opens a charge dialog for the payer of a yearly org, or stops when only the payer can add. One add runs at a time. A declined card or bank confirmation keeps the dialog with nobody added. Store apps never show a price or take a charge (`purchase-policy`). Billing amounts are US dollars from cents. Billing offers `ask_owner` to non-payers, `web` for the payer inside a store app, `checkout` for free orgs and ended subscriptions, `portal` for paid orgs. A free org's weekly pool shows as a share of the week, never a message count. Removing a seat says what happens to it (no refund on yearly). Seat-interval radios name their group because two choices can share a screen.

Lives in `use-seat-add.ts`, `people-seat-flow.ts`, `seat-charge-dialog.tsx`, `billing-tab-model.ts`, `billing-tab.tsx`, `billing-plan-card.tsx`, `billing-usage-card.tsx`, `seat-interval-choice.tsx`.

## Activity feed

Audit entries map to i18n sentence keys plus vars, reading subject shapes defensively so drift still yields a readable sentence. Agent slugs match the engine route key first, then id, then a humanized slug for deleted agents. Pages use a before-cursor; a short page means the tail. Owners see the whole org; admins only their managed agents (the gateway filters).

Lives in `org-activity-format.ts`, `org-roster.ts`, `org-view-model.ts`, `activity-tab.tsx`.

## Share analytics

Share events carry counts only, no names.

Lives in `org-chart-share-track.ts`.

## e2e hook

`data-admin-section-body` names the mounted section for e2e helpers, because the header lozenge repaints synchronously on click and only the body attribute proves the swap.

Lives in `admin-section-body.tsx`.
