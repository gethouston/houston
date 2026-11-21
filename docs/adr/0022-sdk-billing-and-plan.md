# Billing and plan rules are read in one place

The billing module (`packages/sdk/src/modules/billing`) covers an org's Stripe subscription, the free-slot swap, a free org's routine rules and presence, and the free-org pick. The plan module (`packages/sdk/src/modules/plan`) covers the per-person plan: its summary, the launch announcement and the Plus checkout. Both are plain commands over hosted-gateway routes, with the same no-degrade and 401 rules as the other gateway modules (see the accounts and spaces ADR).

Most of these files are pure view models. They exist so that every surface and the AI Manager reach the same answer from the same wire, and no surface derives a billing rule itself. A surface renders what they return and decides nothing.

## Scope of each route family

- Subscription, checkout and portal routes are space-scoped: the gateway reads the org from the session plus the active-space header (`http.ts`).
- The free-org pick (`choice.ts`, `/v1/me/billing-choice*`) is account-wide. The gateway reads the session alone and the adapter's `fetch` never stamps a space on it, so a pick is the same from every space.
- A free org's routine rules and presence (`routines.ts`, `/v1/me/routines*`, `/v1/me/presence`) ride the active org's `x-houston-org`, and the gateway applies that org's tier.

## Prices come only from the wire

`seat-price.ts` holds no figure. A price change, or a payer kept on an older price, reaches every surface untouched.

- `checkoutIntervalField` names yearly and sends monthly as an absent field. Every gateway reads an absent interval as monthly and an older one refuses a named `"month"`. Yearly is offered only where the gateway sent a yearly price (`seatPlans`, `sellableInterval`). `DEFAULT_CHECKOUT_INTERVAL` preselects yearly, as the website does.
- `OrgBillingPrice` is `unpriced` when the wire does not state an interval or seat price (no subscription, a comp grant, an unknown interval, a price not yet read from Stripe). No figure is shown rather than a guessed one. During a seat grace the subscription still bills one seat until `graceEndsAt`.
- A yearly subscription bills its paid seats, which can outnumber members because a removed person's seat stays paid until renewal, and renews for the seats in use, which pending invites can push higher (`seats` in `seat-price.ts`, `SeatUsageView` in `seat-usage.ts`).
- `stripeCurrencyDecimals` (`plan/format.ts`) treats every currency outside Stripe's two explicit lists as two-decimal, including ones ICU formats with zero decimals (ISK, HUF, TWD, IDR). Reading the digits from `Intl` would show those amounts 100 times too large.

## Refusals are outcomes, recognized with their status

`claimFreeSlotRefusal` (`http.ts`), `billingChoiceRefusal` (`choice.ts`), `seatIntervalRefusal` (`seat-refusal.ts`) and `plusCheckoutRefusal` (`plan/refusals.ts`) each recognize a code only with the HTTP status the contract pairs it with. An unrelated error that carries the same word stays a bug and reaches triage. The recognized ones are states the person is in (yearly turned off since prices were read, already on Plus, the account being deleted) and return as outcomes.

## Checkout tracking

`BillingCheckoutTracker` (`checkout-tracker.ts`) is the one outstanding-checkout state of an app, keyed by the org being paid for and shared by every entry point.

- A second `start` while one is outstanding is refused, so a person never has two Stripe sessions open unless they end the first (`abandon`, or a cancel through `returned`). The state outlives the surface that started it, so closing that surface neither stops the poll nor loses the success.
- `reset` and `abandon` bump a generation, so a start from the previous identity or an abandoned checkout cannot land on the next one. The session URL cannot tell them apart, because the gateway returns the same session within the hour.
- Only the orgs list says an org is paid. `returned` with success changes nothing; `observe` reports success once, when `orgPaidUp` (`checkout-state.ts`) holds. `orgPaidUp` requires a paid tier, an active status and no scheduled lock, because a failed payment keeps the tier and sets a lock and must never read as a successful checkout.
- `BILLING_CHECKOUT_WINDOW_MS` (10 minutes) bounds the poll. `BILLING_CHECKOUT_RETURN_MS` (24 hours) is separate and longer, because Stripe's page can stay open long after the poll gives up, and `claimReturn` still answers that return.

## Locked orgs and recovery

`recovery.ts` decides what a locked or locking org lets the caller do.

- A locked org (403 `needs_upgrade`) refuses writes for everyone, owner included: sends, new agents, file and settings edits. Reading, moving agents out, removing members and paying stay open (`orgLocked`). A gateway that predates org billing only flags a locked team `degraded`, which also reads as locked (`OrgStanding`).
- `orgRecovery` lists the way out in the order a surface offers it. Only the billing owner pays. With no live subscription the way out is `checkout`, `claim_free` or `delete`. A failed payment, a past-due org and a cancel at period end still hold their subscription, so the way out is `portal`. Everyone who does not pay is told `ask_owner`.

## Free-org routine rules

- `routineScheduleFloor` (`schedule-floor.ts`) uses the active org's tier for any routine in it, whoever saves, because the gateway judges every fire against the org the routine lives in. `RoutineScheduleFloor.allows` is the one check the stepper and Save both use. It judges a cron by its smallest real gap between fires, and the rule lives in `@houston/domain` so the host's routine-write gate uses the same function.
- `triggerPlanSkipNotice` (`trigger-skip-notice.ts`) exists because webhook and app events a free org refuses are dropped before they become runs, so without it a routine would appear to ignore them silently. The inactivity pause and the routine limit each split in two because the remedy differs while routines are still paused. A viewer who did not create the routine gets the read-only `creator_plan` notice; a routine naming no creator (an Agent Store install or an import) belongs to the viewer, the same rule the connection badge uses. While the session is unknown the notice waits instead of showing the wrong variant. A code from a newer gateway shows nothing, since a guessed notice would name the wrong reason. `isKept` compares a key that names the agent too, so a stale key for the same routine id under another agent never hides a live refusal.
- `planLaunchRefreshDelay` (`model.ts`) schedules a refetch at the next instant billing changes on its own (the weekly reset, a scheduled lock). `MIN_REFRESH_MS` (30 s) is a floor so a client clock running ahead of the gateway cannot refetch every second, and `MAX_TIMER_MS` caps the delay at `setTimeout`'s signed 32-bit limit.

## The free-org pick and the pricing-change modal

The pick is the account-wide choice of which owned org stays free when plans move to orgs. `choice-model.ts`, `choice-picker.ts`, `choice-pick-settle.ts`, `choice-done.ts`, `choice-flow.ts`, `choice-modal.ts`, `choice-modal-frame.ts` and `choice-modal-pages.ts` model it.

- `ChoiceNotice` never reads the active space. The notice is dismissed once for the account, so the space it happens to show in must not change what it says.
- `DAY_ZONE` is UTC. The cutover is seeded at `05:00Z` (midnight in the Americas), which is the same day in UTC but the day before in the launch zone, and the grace end arrives as a bare `YYYY-MM-DD`, which parses as UTC midnight. Separately, `LAUNCH_TIME_ZONE` (`plan/format.ts`) is `America/Los_Angeles`, because formatting the plan launch instant in the viewer's zone would show the wrong day west of it.
- `canChangeChoice` never offers a picker the gateway would refuse. `pickerRows` orders by 30-day messages, latest activity, personal org, then slug, so equal orgs always list the same way.
- A `not_payer` refusal means the gateway holds no subscription for the person. `pickRefused` drops the paid step even while the cached choice still names them a payer, because resending the pair would be refused again. `settlePick` keeps that refusal only while the choice still names a payer, since the refetch can lag, and clears it once a choice names none, so a subscription started in another tab brings the paid step back. A surface stores the settled frame on every change, because payer, then none, then payer again with no click between must end on the paid step, which a read alone cannot do.
- `saveSettlesNotice`: any pick stored after the cutover applied one settles the notice for good, so the surface stores the dismissal and no device asks again. A save before the cutover settles nothing.
- `ChoiceModal`: `session` modals (an owner who still has to pick or confirm) return on every app open until they act. An `everywhere` modal is a read-only notice; closing it stores the dismissal on the server, and a dismissal that fails leaves the record unset so a later open retries. The modal never stacks on a plan dialog and waits while the plan that might bring one is still loading (`planDialogBlocks`). The promo-ended modal follows the same one-modal-at-a-time rule (`promoEndedModalOpens` in `price-notice.ts`).
- `nextChoiceModalFrame` keeps the frame's content through the close animation and holds the step while a save is in flight (`until_answer`). A stored pick can turn a `confirm` notice into `applied` before the save's own answer lands, and the frame waits for that answer so the read-only note never flashes in place of the success step. Only the person closes a success step.

## Plus

- `plusCheckoutOrgSlug` and `plusOfferApplies` (`plus-org.ts`) offer Plus only in the person's own personal org, because that is the org Plus bills. In anyone else's org, or a team org of their own, buying Plus would change nothing about the org in front of them.
- `planSummaryPercent` (`plan/billing-model.ts`) is the per-person usage for the settings Plan screen alone. Every other surface reads the active org's pool from `billing/model.ts`.
