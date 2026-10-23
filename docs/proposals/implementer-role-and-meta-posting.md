# Proposal: Houston Partner role and direct Meta posting

Status: draft for decision. No product code changed.
Date: 2026-10-23.
Context: an agency partner that resells and implements Houston agents for its clients asked for both features. Customer names, deal details and the draft reply to the customer are kept out of this file because this repo is public. They live in the working session.

## Summary

### Partner role

**What the agency needs:** its client owns and pays for the Houston org, while the agency keeps control of the agents it built. That means protecting their instructions and skills (the agency's IP) and being able to switch them off when the client stops paying the agency.

**Why it can't work today.** The agency has to be the org's owner, for two reasons in the code:

1. An owner can never be removed from an agent. "Only specific people" always re-adds every owner (`app/src/components/agent/agent-access-model.ts:160`). So a client who is owner can never be locked out, and the lock only works if the agency is the owner.
2. An owner manages every agent (`app/src/lib/agent-access.ts:32`). They can open its Settings, read `CLAUDE.md` and the skills in Files, and export the whole agent. A client owner would get the agency's IP.

**Recommendation:**
- Add a fourth org role, `partner`, for the agency's people inside the client's org.
- Add a per-agent **managed** mark on the agents a partner builds or deploys there.
- On a managed agent, partners hold the configuration (sealed from everyone else, owner included) and can **pause** or resume it.
- The owner keeps the org, its people, its billing, its data, and the right to remove the agency. Removing the agency pauses its managed agents rather than handing them over.

**Size and timing:**
- **L** overall. Most of it is in the closed cloud gateway, which is the only enforcer.
- Our side, here, is about **M**.
- A design decision plus a gateway spike fit by 2026-11-06. A build clients can use does not.

### Direct Meta posting

**Can we do it?**
- Probably yes, partly already today, through Composio.
- Composio's Facebook toolkit has `FACEBOOK_CREATE_POST`, `FACEBOOK_CREATE_PHOTO_POST` and `FACEBOOK_CREATE_VIDEO_POST`. Its Instagram toolkit has `INSTAGRAM_POST_IG_USER_MEDIA` plus `INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH`. Both offer Composio-managed sign-in.
- Instagram is already pinned in our own "Most used" catalog (`app/src/components/integrations/browse-sections.ts:61`).
- Nobody has confirmed it end to end. A one-hour live test with a real Instagram Business account and a Facebook Page settles it.

**How soon?**
- If the test passes, a first version is days of work.
- The work is the public media link Instagram requires, and a hard approval step before anything is published.

**What's blocking a production-grade version?** Meta, not code. For an app that other businesses use with these permissions, Meta requires all three of:
- Business Verification;
- App Review for Advanced Access;
- Access Verification as a **Tech Provider**.

Meta's Access Verification list names `pages_manage_posts` and `instagram_business_content_publish` explicitly.

**The other session matters.** The houston-os Meta session is working on exactly these steps for WhatsApp, under the same business portfolio. Business Verification is per business, so it carries over. App Review and Tech Provider access are per app and per permission, so Pages and Instagram need their own review.

### Decisions needed (details in A8 and B7)

- Partner rules: all decided 2026-10-23 (A8). The role is called Houston Partner (`partner` on the wire).
- Partner pricing: decided 2026-10-23, partners are normal paid seats.
- The Meta live test: skipped for now (decided 2026-10-23), so Composio stays unverified.
- Whether to apply for our own Meta app.
- Priority: decided 2026-10-23, the partner role goes first, Meta posting after.

---

## Part A: Houston Partner role

### A1. How it works today (code facts)

Vocabulary: the UI says **Team** or **organization**, the wire says org. Roles on the wire are `owner | admin | user`, shown as **Owner / Manager / Member** (`app/src/locales/en/teams.json:226`). Per-agent access is a second, separate axis: `manager | user`.

| Fact | Where |
|---|---|
| Org roles `owner \| admin \| user` | `packages/protocol/src/core.ts:45`, `packages/wire-types/src/types.ts:257`, runtime mirror `packages/sdk/src/modules/org/types.ts:39` |
| Per-agent access `manager \| user` | `packages/wire-types/src/types.ts:373` |
| Owner manages every agent; others need `access === "manager"` | `app/src/lib/agent-access.ts:32` (`isAgentManager`) |
| Owners are always on every agent's roster and can't be removed | `app/src/components/agent/agent-access-model.ts:146-160` (`buildSharePeople`) |
| "Everyone" vs "Only specific people" is one wire shape: an empty assignee set means everyone | `app/src/components/agent-settings/agent-people-choice.ts`, `PUT /v1/agents/:slug/assignments` |
| Member management, org delete: owner only. Agent creation: owner or Manager | `app/src/lib/org-roles.ts:71,117,130` |
| Non-managers see Mission control, Routines and Files; Settings is managers only | `app/src/lib/team-sections.ts:11` |
| Files lists `CLAUDE.md`; skills (`.agents/skills/`, `.houston/skills/`) are served as documents | `packages/host/src/turn/files.test.ts:84`, `packages/host/src/routes/agent-file-scope.ts:21` |
| Whole-agent export (instructions, skills, learnings, routines) | `packages/host/src/routes/portable-export.ts:69` (`POST /agents/:agentId/portable/export`) |
| Moving an agent between orgs the caller belongs to | `packages/sdk/src/modules/spaces/index.ts` (`moveAgent`), gateway `POST /v1/agents/{slug}/move` |
| Billing: `active \| past_due \| locked`, with `lockReason` `unpaid \| canceled \| payment_failed \| migration`; only the billing owner pays | `packages/wire-types/src/org-billing.ts:13,48`, `packages/sdk/src/modules/billing/recovery.ts` |
| During a billing lock, anyone but a Member may `move_out` agents | `packages/sdk/src/modules/billing/recovery.ts:52` (`role !== "user"`) |
| Seats are the live count of org members | `packages/wire-types/src/types.ts:432` |
| Missions are visible to their creator, contributors and people mentioned, not to the whole org | `packages/protocol/src/domain/mission-audience.ts` |
| Routines run on their creator's connected apps | `convergence/contracts/C4-grants.md:13` |
| Connected apps are per person (Composio `user_id`); grants are per (person, agent) | `convergence/contracts/C1-integrations-api.md`, `C4-grants.md` |

Enforcement: every rule above is decided by the closed cloud gateway. The app's gates are cosmetic, as the comments in `org-roles.ts` and `agent-access.ts` say. On a gateway-fronted pod the host trusts the gateway (`packages/host/src/routes/agent-authz.ts`). `convergence/contracts/C3-org-role-model.md` is out of date: it still has the admin "see all agents" rule and the "one org per user" rule. Matrix v2 and multi-membership replaced both.

### A2. User stories

- **Agency (partner).** "I build and maintain AI Employees inside my client's Houston org. My instructions and skills are my product, so my client's people can use them but not read or copy them. If my client stops paying me, I pause my agents in their org. When we part ways, my agents stop and my client keeps their own data."
- **Client's IT person (owner).** "My company owns and pays for our Houston org. I control who is in it, including the agency. I can see which AI Employees the agency manages and who to call. I keep our files and conversations. I'm never surprised: if something is paused, I see who paused it and why."
- **Client's staff (member).** "I use the AI Employees I've been given. If one is paused, it tells me in plain words and who to contact."

### A3. Options considered

1. **Keep the agency as owner (today).** Works for the agency, fails the client: the client doesn't control its own org, and the agency is the billing owner by default. Rejected.
2. **Make the agency a Manager (`admin`).** Managers can see billing (`app/src/lib/billing-gates.ts:19`), and the owner still reads every agent's IP and can never be locked out. Fixes nothing. Rejected.
3. **Agents stay in the agency's org, client staff join as guests.** Protects IP. But Houston would bill the agency, not the client, and the client's data and connected apps would sit in the agency's org. That contradicts "the client pays Houston for the platform". Rejected for v1. It may come back as a later "agency workspace" for managing many clients.
4. **Recommended: a `partner` org role, plus partner-managed agents.** Reuses membership, invites, the org switcher (an agency person already belongs to many orgs), the audit log and billing as they are. Adds one role and one per-agent mark.

### A4. How it works

**Concepts.**
- **Partner**: an org member with role `partner`, shown as **Partner** in every language; the agency's program is **Houston Partner**. Only an owner can grant it.
- **Managed agent**: an agent carrying `managedBy: "partner"`. It is set automatically when a partner creates an agent in the org, or moves one in from their own org. A partner can also claim an existing agent, but only with the owner's confirmation.
- **Paused**: a managed agent's `pause: { by, at, note? } | null`. A paused agent refuses chat turns and routine runs with an authored, translated message: "This AI Employee is paused. Contact <partner name>." It keeps its data. Missions, files and conversations stay readable to the people who could read them before.

In v1, all partners in an org act as one group, so one agency per client org. Two agencies in the same org is out of scope for v1 (A8.6).

**Lifecycle.**
1. **Join.** The owner invites the agency person with role `partner`. The owner sees a confirm step that explains what a partner can do, including pausing. That one confirmation is the owner's agreement to every later pause.
2. **Deploy.** The partner builds in the client org, or builds in the agency's own org and moves the agent in (`POST /v1/agents/{slug}/move`). Either way the agent becomes managed.
3. **Run.** The owner, or the partner, decides who on the client side can use it ("Everyone" / "Only specific people"). Client staff connect their own apps (HubSpot and so on). See the routine caveat in A7.
4. **Pause and resume.** The partner pauses or resumes any managed agent in one action, or all of them at once. The owner sees the state, who did it, and when.
5. **Release.** The partner can release an agent: it stops being managed, the seal lifts, and the owner manages it like any other. This is the "hand over the IP" action, and only the partner can do it.
6. **Agency removed or leaves.** Every managed agent pauses and stays sealed. The client keeps its data. The agent configuration is not handed over. The owner can delete a paused agent (A8.2).

**Permission matrix (proposed).** Rows marked *managed* apply to managed agents. Unmanaged agents keep today's rules.

| Capability | Owner | Manager (`admin`) | Partner | Member (`user`) |
|---|---|---|---|---|
| Invite, remove, re-role members | yes | no | no | no |
| Grant or revoke the partner role | yes | no | no | no |
| Remove the partner from the org | yes | no | leave only | no |
| Delete the org | yes | no | no | no |
| See billing, seats, invoices | yes | yes | **no** | no |
| Pay, change plan, open the billing portal | billing owner | no | **no** | no |
| Create agents | yes | yes | yes (born managed) | no |
| *managed*: use the agent | if assigned* | if assigned | yes | if assigned |
| *managed*: choose who can use it | yes | no | yes | no |
| *managed*: open Settings, edit instructions, skills, model, allowed apps | **no** | no | yes | no |
| *managed*: read `CLAUDE.md` and skills in Files | **no** | no | yes | no |
| *managed*: portable export | **no** | no | yes | no |
| *managed*: pause / resume | no | no | yes | no |
| *managed*: release (hand over configuration) | no | no | yes | no |
| *managed*: move out of the org | no | no | **no** in v1 | no |
| *managed*: delete | open question 2 | no | no | no |
| *managed*: see paused state, who paused it, contact | yes | yes | yes | yes (banner) |
| *managed*: read conversations | own and shared only | own and shared only | own and shared only | own and shared only |
| *managed*: read output files (the working tree minus instructions) | yes | if assigned | yes | if assigned |

\*Today owners are implicitly on every agent's roster. For managed agents the owner keeps that, but as a user of the agent, not a manager.

**The billing lockout: two separate locks.**

| | Houston billing lock (exists) | Partner pause (new) |
|---|---|---|
| Who sets it | Houston billing (`lockReason`) | A partner |
| Covers | The whole org | Managed agents only |
| Who clears it | The billing owner, by paying | The partner who manages them |
| What the client sees | Today's billing recovery (`orgRecovery`) | "Paused, contact <partner>" |
| Partner's actions during it | Ask the owner. No `move_out` (today's `role !== "user"` rule would wrongly grant it, so it must change) | Pause, resume, release |

The two never mix: the partner can't see or trigger Houston billing, and Houston billing never decides whether the agency was paid. Both can be active at once. The agent runs only when neither is.

### A5. Changes needed, by area

| Area | Where | What | Size |
|---|---|---|---|
| Wire shapes | `packages/protocol/src/core.ts`, `packages/wire-types/src/types.ts`, `packages/wire-types/src/agents.ts` | Add `"partner"` to `OrgRole`. Add `managedBy` and `pause` to `Agent` (additive). Add refusal codes `agent_paused`, `partner_managed`. | S |
| Gateway (cloud repo) | org members, invites, assignments, move, proxy path gating, turn and routine admission, billing summary | The real enforcement: role matrix, seal (deny config paths, `CLAUDE.md`, skills and portable export to non-partners on managed agents), pause admission (chat and routines), billing fields hidden from partners, pause-on-removal, audit events. Re-vendor the route inventory (`pnpm vendor:gateway-routes`). | L |
| Host | `packages/host/src/turn/files-list.ts`, `routes/agent-file-scope.ts`, `routes/portable-export.ts` | Files listing must drop `CLAUDE.md` and skills for callers the gateway marks as sealed-from (needs a claim on the signed acting-as header), since the gateway can't filter a listing body it only proxies. | M |
| Product prompt | `packages/host/src/houston-prompt.ts` | Tell a managed agent not to recite its instructions. Best effort only (see A7). | S |
| SDK | `packages/sdk/src/modules/org/types.ts` (`ORG_ROLES`), `packages/sdk/src/modules/agents/` | Add `pause`, `resume`, `release` methods with `@assistant` JSDoc (the AI Manager can do it for a partner), and refusal classification. Fix `recovery.ts:52`. | M |
| Engine adapter | `packages/engine-adapter` | Bind the new methods via `viaSdk`. | S |
| App gates | `app/src/lib/org-roles.ts`, `app/src/lib/agent-access.ts`, `app/src/lib/billing-gates.ts`, `app/src/lib/team-sections.ts`, `app/src/components/agent/agent-access-model.ts` | About 20 org-role comparisons across `app/src` and the SDK assume three roles. Each needs a decision (`Record<OrgRole, …>` in `org-chart-people.ts:34` at least fails to compile). | M |
| App UI | `app/src/components/organization/` (roster, role picker, confirm), `app/src/components/agent-settings/` (managed badge, pause, release), chat banner; `app/src/locales/{en,es,pt}` | Both breakpoints. Bump `design/inventory/inventory.yaml` for new components. | M |
| Proof | `packages/web/tests/wire-org.test.ts`, `wire-spaces.test.ts`, a new `wire-agent-pause.test.ts`, SDK module tests, `app/tests/org-roles.test.ts`, e2e for the paused banner | | M |
| Docs | `convergence/contracts/C3-org-role-model.md`, `CONTEXT.md` | Update the matrix. Define *partner*, *managed agent*, *paused*. | S |

### A6. Phases

1. **Now, no code.** Keep today's workaround (agency as owner). Write the agency-client terms that the role will encode.
2. **v1.** Role, managed mark, seal, pause and resume, release, pause on removal. One agency per org.
3. **Later.** An agency workspace across all its clients: push one agent update to every client, roll up health. Possibly a separate partner billing plan.

### A7. Risks

1. **Customer trust and legal.** A non-owner who can switch off a paying customer's tools is the sharpest edge here. It needs a clear disclosure when the role is granted, a visible "paused by" banner, the agency-client agreement, and a line in Houston's terms. Get a legal read before shipping.
2. **IP protection is partial, not absolute.** The seal stops the UI, the files routes and export. It can't stop a client user asking the agent to "tell me your instructions" in chat. Prompt guidance lowers that risk but doesn't remove it. Say so to agencies; don't promise secrecy.
3. **Routines run on their creator's connected apps** (C4). A routine the agency sets up runs on the agency person's HubSpot connection, or fails if they have none. Real client work needs a client person to connect the app and own the routine, or the agency to hold client credentials. Decided: client people connect and own them (A8.5).
4. **Seats.** Partners count as seats (`count(org_members)`), and that stays (decided 2026-10-23): the client pays Houston a normal seat for each agency person. The confirm step when granting the role should say so, so the client isn't surprised by the invoice.
5. **Gateway first.** Every rule lives in the closed gateway. A UI that ships ahead of it promises protection the server doesn't give. Gate the UI on the server advertising the role.
6. **Role sprawl.** About 20 call sites compare roles directly. Missing one can widen power, as `recovery.ts:52` (`role !== "user"`) already shows.
7. **Compromised agency account.** One login could pause every client at once. Rate-limit pausing "all", and record it in the audit log.
8. **Contract drift.** C3 was stale. Matrix v3 is now written into `convergence/contracts/C3-org-role-model.md`; the gateway builds to that.

### A8. Open questions

1. **Pause without the owner's agreement?** Decided (2026-10-23): the owner agrees once, when granting the partner role (a confirm step with the explanation). There is no approval per pause. A legal read of the wording is still needed (A7.1).
2. **Can the owner delete a paused managed agent?** Decided (2026-10-23): yes. It's their org and their data, and deleting doesn't leak IP. Their way out is deletion, not takeover.
3. **Partner pricing:** decided (2026-10-23): normal paid seats, no change to billing.
4. **Conversation privacy:** decided (2026-10-23): partners get no access beyond today's mission audience rules.
5. **Client credentials:** decided (2026-10-23): the agency never connects a client's apps under its own login. Client staff connect, and routines on managed agents belong to a client person. Still open: how a partner hands a routine it set up to a client person.
6. **Two agencies in one client org:** decided (2026-10-23): out of scope for v1; all partners in an org manage its managed agents together.
7. **Priority and date:** decided (2026-10-23): the partner role goes before Meta posting. Still open: is 2026-11-06 the roadmap date or a ship date? This doc assumes roadmap.

---

## Part B: direct Meta posting (Facebook Pages and Instagram)

### B1. The plain answer

- **Can we do it?** Yes, technically, and possibly partly today through Composio. Not yet verified.
- **How soon?**
  - A live test: about an hour.
  - A usable first version on Composio's Meta app: days of work, mostly the public media link and an approval step.
  - A production version on our own Meta app: weeks, set by Meta's review queue, not engineering.
- **What's blocking?**
  1. Nobody has run the live test (skipped for now, 2026-10-23).
  2. Instagram only accepts media from a public URL, while agent files are private.
  3. Posting needs a hard approval step.
  4. For our own Meta app: Business Verification, App Review (Advanced Access), and Tech Provider Access Verification.

### B2. What exists today

- **Composio platform mode** behind the `IntegrationProvider` port (`packages/host/src/integrations/composio.ts`). The catalog is about 1,500 toolkits (`composio-catalog.ts`). Instagram is pinned in "Most used" (`app/src/components/integrations/browse-sections.ts:61`).
- **Auth config reuse.** `resolveAuthConfig` (`packages/host/src/integrations/composio-auth-config.ts:26`) uses an existing enabled auth config for a toolkit before creating Composio's managed one. Moving Facebook or Instagram onto **our own** Meta app is a Composio dashboard setting (a custom auth config with our app's credentials), with no code change. The gateway ports this adapter (C1); confirm it behaves the same.
- **Approvals.** The runtime no longer has a hard approval gate for integration actions. A change action is confirmed up front by an `ask_user` question (`packages/runtime/src/session/tools/integrations.test.ts:524`). A routine has no one to ask.
- **LinkedIn module** (`packages/sdk/src/modules/linkedin/`, gateway `/v1/linkedin/*`). A person shares their org chart image (`app/src/components/organization/org-chart-share-line.tsx`). It's a pattern for gateway-owned OAuth plus a refusal policy, not for agent posting.
- **ManyChat** (`packages/host/src/integrations/custom/curated-entries.ts`) covers Instagram DM and Messenger messaging, not posting.

### B3. Meta's rules (official docs, read 2026-10-23)

- **Facebook Pages.**
  - `POST /{page_id}/feed` (text and link), `/{page_id}/photos`, `/{page_id}/videos`.
  - Scheduling via `published=false`, 10 minutes to 30 days ahead.
  - A Page access token, with `pages_manage_posts`, `pages_read_engagement` and `pages_show_list` (plus `publish_video` for video).
  - The person must hold content-creation tasks on the Page.
  - Sources: [Pages API posts](https://developers.facebook.com/docs/pages-api/posts/), [video publishing](https://developers.facebook.com/docs/video-api/guides/publishing), [permissions](https://developers.facebook.com/docs/permissions/).
- **Instagram.** Professional (Business or Creator) accounts only. Three login paths:
  - Instagram Login: `instagram_business_basic` and `instagram_business_content_publish`. No Facebook Page needed.
  - Unified Login: Meta now recommends it for new integrations.
  - Facebook Login: needs a linked Page and `pages_read_engagement`.
  - Accounts linked to a Page that requires Page Publishing Authorization can't publish until it's done.
  - Sources: [content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/), [overview](https://developers.facebook.com/docs/instagram-platform/overview/).
- **Instagram limits.**
  - Meta's page contradicts itself: "100 API-published posts within a 24-hour moving period" in the rate-limit section, "50 published posts within a 24-hour period" in the carousel section.
  - Plan for 50, and read `GET /{ig_id}/content_publishing_limit` before posting.
  - A carousel counts as one post.
- **Instagram media.**
  - Images: JPEG only, 8 MB max, aspect ratio 4:5 to 1.91:1, publicly hosted URL.
  - Carousels: up to 20 items (Composio's carousel action takes 2 to 10).
  - Reels: up to 15 minutes and 300 MB.
  - Story video: up to 60 s.
  - Unpublished containers expire after 24 h.
  - Source: [IG media reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media).
- **Access for accounts we don't own.**
  - Advanced Access is "required when your app serves accounts you don't own or manage", and it "requires App Review and Business Verification".
  - Apps with Advanced Access also do an annual Data Use Checkup.
  - Sources: [IG overview](https://developers.facebook.com/docs/instagram-platform/overview/), [access levels](https://developers.facebook.com/docs/graph-api/overview/access-levels/).
- **App Review.**
  - A screencast per permission, a privacy policy URL, a 1024×1024 icon, and a use-case text per permission.
  - A data deletion URL or callback is required by the app dashboard.
  - Meta states a decision "within a week" per submission.
  - Sources: [submission guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide/), [data deletion](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/).
- **Tech Provider (Access Verification).**
  - Required for "an app that will be used by other businesses" with any listed permission. The list includes `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`, `publish_video`, `instagram_content_publish` and `instagram_business_content_publish`.
  - Business Verification must come first.
  - Source: [access verification](https://developers.facebook.com/docs/development/release/access-verification/).
- **Composio.**
  - Facebook: `FACEBOOK_CREATE_POST`, `FACEBOOK_CREATE_PHOTO_POST`, `FACEBOOK_CREATE_MULTI_PHOTO_POST`, `FACEBOOK_CREATE_VIDEO_POST`, plus schedule, edit and delete actions.
  - Instagram: `INSTAGRAM_POST_IG_USER_MEDIA`, `INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH`, `INSTAGRAM_CREATE_CAROUSEL_CONTAINER`, `INSTAGRAM_GET_IG_USER_CONTENT_PUBLISHING_LIMIT`.
  - Both list Composio-managed OAuth as available.
  - Composio warns that managed apps share quota across all its customers and show Composio's name, not ours, and suggests your own app in production.
  - Sources: [Facebook toolkit](https://docs.composio.dev/toolkits/facebook), [Instagram toolkit](https://docs.composio.dev/toolkits/instagram), [managed vs custom](https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app).

### B4. Paths

1. **Composio-managed Meta app (test now).** Zero setup on our side. Unknown: whether Composio's app actually has Advanced Access and Tech Provider status for other businesses' accounts. The live test answers that. Shared quota and Composio branding make it a bridge, not the end state.
2. **Composio with our own Meta app (recommended end state).** Same code path: grants, search, execute and the connect card stay as they are. We register a Meta app and pass Business Verification, App Review and Tech Provider. Then we add one custom auth config per toolkit in the Composio project. People see "Houston" on Meta's consent screen, and quota is ours.
3. **Our own gateway module (like LinkedIn).** Only if Composio's actions turn out not to be enough (for example, Reels upload limits or Stories). Size L. Not recommended for v1.

**Product work on any path:**
- **Public media URL.** Instagram downloads the image itself. Agent files are private, so we need a short-lived signed URL for one file, served by the gateway or object storage. **M**. It touches the gateway and a host file route, and needs a security review (expiring, single-file, unguessable).
- **Hard approval before publishing.** A public post is irreversible in practice. Recommendation: publishing actions always need an explicit approve in the activity feed, including inside routines (queued for approval rather than posted). **M**, in runtime, SDK and app.
- **Limits and errors.** Read the publishing limit first. Map Meta errors (expired token, PPA required, limit hit) to authored, translated states, with the agent explaining them in plain words. **S**.
- **Agent skill.** A "post to Instagram / Facebook" skill for the marketing agent template (`store/agents/marketing/`), with format rules (JPEG, aspect ratios, carousel size). **S**.

### B5. Changes needed, by area (paths 1 to 2)

| Area | Where | What | Size |
|---|---|---|---|
| Live test | dev or prod app, a test IG Business account and FB Page | Connect, draft, publish, delete | S (an hour) |
| Meta app and review (no code) | Meta developer console, under the business portfolio the houston-os session is verifying | App, privacy and deletion URLs, screencasts, App Review, Tech Provider | M (calendar weeks) |
| Composio config | Composio project dashboard | Custom auth configs for `facebook` and `instagram` with our app | S |
| Public media URL | gateway, `packages/host/src/routes/` (files), `packages/wire-types`, `packages/sdk` | Signed, expiring, one-file link | M |
| Publishing approval | `packages/runtime/src/session/tools/integrations.ts`, SDK activities, app activity feed | Hard approval for publishing actions, routines included | M |
| Refusals and copy | `packages/wire-types`, SDK policy, `app/src/locales/{en,es,pt}` | Meta-specific states | S |
| Template skill | `store/agents/marketing/.agents/skills/` | Posting skill and format rules | S |
| Proof | `packages/web/tests/` wire tests, runtime tests, e2e | | M |

**Total: M** of engineering on top of a Meta review of several weeks, versus **L** for path 3.

### B6. Risks

1. **Composio's managed Meta app may not be approved for other businesses' accounts.** The live test exposes this immediately.
2. **Meta review rejections** add a week or more per round. Screencasts must show a real, attended publishing flow (with the approval step), never an unattended bot.
3. **Accidental or spam posting** from a routine harms the client's brand and can get the app restricted. The hard approval step is the mitigation.
4. **The 50 vs 100 limit** is ambiguous in Meta's own docs. Assume 50.
5. **Client account setup:** Personal Instagram accounts and Pages without the right roles fail. The connect flow needs plain-language guidance.

### B7. Open questions

1. **Live test:** skipped for now (decided 2026-10-23). When it's picked up, it needs a real Instagram Business or Creator account and a Facebook Page someone controls, connected in the Houston app. Until then, B1's "possibly works today" stays unverified.
2. **Apply for our own Meta app (path 2)**, under the same business portfolio as the houston-os WhatsApp work? Recommendation: yes, as a separate app from the WhatsApp one, so their reviews don't block each other. Same verified business.
3. **Instagram first, or both from day one?** Composio has both, so the test should cover both.
4. **Priority:** decided (2026-10-23): after the partner role.

### B8. Relation to the houston-os Meta session

That session's notes list Business Verification, App Review and Tech Provider enrollment as prerequisites for WhatsApp Embedded Signup, with verification still to do. Meta's Access Verification list puts Pages and Instagram publishing permissions under the same Tech Provider rule. So:
- **Business Verification** is per business, so finishing it there unblocks us too.
- **App Review and Advanced Access** are per permission and app. Pages and Instagram need their own submission.
- **Tech Provider status** applies to any app other businesses use with the listed permissions. Confirm with that session whether it's granted per business or per app, and whether one enrollment covers both use cases.

## Not verified

- The live end-to-end post through Composio (Composio-managed app) from Houston.
- Which Instagram limit Meta enforces (100 or 50).
- Whether Composio's managed Meta app holds Advanced Access and Tech Provider status.
- Whether the cloud gateway's Composio port reuses existing auth configs the way the host adapter does.
- Gateway behavior generally: described from the contracts and the client code. The closed cloud repo was not read.
