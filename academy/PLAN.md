# Houston Academy: From Zero to Hero (the plan)

> **Status:** approved 2026-10-23. **M1 (the pilot) is in progress**: see §10 and the decisions in §11. Lives in `gethouston/houston` under `academy/`.
> **Research notes and sources:** [`research/landscape.md`](research/landscape.md)

## Summary

**Houston Academy is a free, open-source program, in English and Spanish, that teaches non-technical people (PMs, designers, ops leads, founders) to plan, build and run production-grade software by steering AI agents.** The agent writes all the code. The Academy teaches everything else: how software works (what an API is, what an API key is, what a server and a database are), how to think like a product builder, and how to take an app to production and keep it safe there.

- **A program, not a course:** 4 levels, 12 courses, electives and a capstone, about 100 hours part-time. Each course ships a project, and the learner's own product grows one slice at a time from Course 2 to the capstone.
- **The basics are covered properly:** Course 1, *How software works*, assumes nothing and explains every word visually: client and server, API, API key, database, login, hosting, tokens.
- **Product thinking is part of the core:** Course 2, *Think like a builder*, teaches the **Builder's Loop**: problem → smallest useful version → slices → "done when" → let the agent build → test → decide. Every project after that uses it. It's the answer to "I want GTA 6 but multiplayer."
- **No terminal at the start:** learners work in the **Claude desktop app**, with chat, a live preview pane, and buttons for permissions, diffs and PRs. Complexity grows in steps: chat → *reading* what the agent runs → the terminal (optional) in the last level.
- **The agent tutors:** the `academy` plugin runs inside the learner's own Claude sessions. It explains what just happened in their language, stops on red flags, and **checks each project by probing the live app**, not by grading code.
- **Bilingual from day one:** every lesson is written in both English and Spanish, with a shared glossary. It isn't machine-translated afterwards.
- **Platform:** Astro + Starlight (i18n built in), in the open-source Houston repo (`academy/`), on Firebase Hosting on GCP at `academy.gethouston.ai`. Certificates reuse Houston's existing certificate system.
- **Why it exists:** distribution for Houston. The way it gets there: be the best free resource for this audience, with Houston as one elective and one capstone option, not an ad on every page.
- **First milestone:** a bilingual pilot of Course 0 (first hour) and the first lessons of Courses 1 and 2, tested with 5 non-technical people, who could come from the Houston bootcamp alumni.

---

## 1. Who it's for

Learners need no coding or technical background. They bring an idea or a problem from their own work, and the patience to build it step by step.

| Persona | Today | Why they're stuck | At the end they can… |
|---|---|---|---|
| **Maya, product manager** at a 200-person SaaS company | Writes PRDs; makes Lovable prototypes that engineers throw away | Prototypes end at localhost. "What's an endpoint?" stops every conversation | Ship a real internal product, review an agent's plan like a tech lead would, and talk to engineers as a peer |
| **Diego, product designer**, freelance, in Medellín | Designs sites, then pays a developer to build them | Opened a GitHub repo once, saw 40 folders, closed it. Would never open a terminal | Take a design to a live app with login and data for clients, and keep it running |
| **Priya, ops lead** at a 30-person logistics company | Runs the company on spreadsheets and Zapier; asks for "an app that does everything" | Has no idea how to scope it, and is afraid of leaking customer data | Plan the product in slices, ship a multi-user tool with roles and backups, and know what it costs each month |

**After the program, a graduate can:**
1. **Plan:** turn a vague idea into a problem, a smallest useful version, and a list of slices, each with a "done when".
2. **Speak the language:** explain API, API key, server, database, auth, deploy, env var and domain with a drawing.
3. **Steer:** run an agent through a plan one slice at a time, and test each slice before the next.
4. **Ship:** take an app from preview to a live URL, a custom domain, preview deploys and production.
5. **Protect:** keep secrets secret, lock down data (login, roles, row-level security), and pass a security checklist.
6. **Run:** know when the app breaks before users do, restore a backup, and read a bill.
7. **Grow:** get real users, learn from them, and iterate.
8. **Lead:** write briefs, run parallel or overnight agent sessions, and accept or reject work by checking evidence, not by reading code.

---

## 2. Principles

1. **No coding, ever.** We never ask the learner to write or read code line by line. Lessons explain *what* code does, never its syntax.
2. **The agent builds; you plan, steer and check.** Every lesson has the same three beats: **tell** (what to ask), **watch** (what the agent does, and what's normal versus a 🚩), **check** (how you know it worked).
3. **One slice at a time.** Big ideas fail; small slices that get tested succeed. The Builder's Loop (Course 2) runs through every project in the program.
4. **No term goes unexplained.** Every technical word gets a plain explanation and a picture the first time it appears, and links to the glossary after that. The program is long so it can go slowly.
5. **Production-grade or it doesn't count.** Security, data safety, cost and monitoring show up from the first project, not in an "advanced" chapter. Every course has a red flag taken from a real incident.
6. **Project-driven.** Each course ships something real. Concepts are taught when the project needs them.
7. **Visual first.** Every concept starts as a picture: an interactive diagram, an annotated replay of an agent session, or a 60-second video. Text explains the picture.
8. **Complexity grows step by step.** The tools grow with the learner: a chat app first, then reading what the agent runs, and the terminal only at the end, as an option.
9. **Native in two languages.** English and Spanish are both first-class: written natively, reviewed by native speakers, sharing one glossary.
10. **Free and open.** All content and tools are open source. No paywalls, no upsell in the middle of a lesson.

**Default learner stack** (concepts come first, brand names second, so the knowledge carries over): Claude desktop app · GitHub · Vercel (hosting, previews) · Supabase (database, login, storage; the visual table editor helps beginners, and its RLS pitfall is the best real-world security lesson available) · Sentry (errors) · Resend (email) · Stripe test mode (an elective). Everything has a free tier. Learners pay for a Claude plan, and a domain later (about $10–15/yr). The plugin's template picks the app framework, so learners never choose it.

---

## 3. The Builder's Loop (the thread through everything)

> 🧭 **The idea:** "I want GTA 6 but multiplayer" fails because nobody, human or AI, can build or test it in one go. Small slices succeed because each one can be built, tested and understood.

```
 Idea ─▶ Problem ─▶ Smallest useful version ─▶ Slices
                                                  │
        ┌─────────────────────────────────────────┘
        ▼
   ┌─▶ Slice brief ("done when…") ─▶ Agent plans ─▶ You approve ─▶ Agent builds
   │                                                                     │
   └── Decide next ◀── Real people try it ◀── You test it ◀──────────────┘
```

- **Taught** in Course 2. **Used** in every course after it: each project starts from a one-page slice brief (a template in the plugin, `/academy:brief`) and ends with "you test it" before moving on.
- **The agent enforces it:** when a learner asks for something huge, the tutor doesn't refuse. It helps them break the request into slices and suggests building the first one.
- **The learner's own product:** in Course 2 each learner picks an idea (or one of a few starter ideas: a booking tool for a small business, a client portal, a team request tracker). Courses 4–10 each add a production layer to it. The capstone is that product, launched.

---

## 4. The program

**4 levels · 12 courses · electives · a capstone.** Each course: concepts (each with its own visual), project, **done when** (proof the tutor can check), 🚩 red flag. Times are learner hours.

### Level 1: Foundations (no terminal; everything happens in the Claude desktop app)

#### Course 0: Hello, internet (the first hour) · ~1h
- **Concepts:** what the Claude desktop app is; a project is a folder; asking for something and watching it get built; the preview pane; permission prompts (read before you click); "published" = copied to a computer that never sleeps.
- **Project:** *Your corner of the internet*: a personal page, made by asking, seen in the preview pane, then live at a public URL on your phone.
- **Done when:** the URL loads on your phone; you can find the project folder on your computer; you can say what "published" means.
- **🚩** Clicking "Allow" without reading. Your first job as the person in charge.

#### Course 1: How software works · ~10h
The vocabulary course. Every module is a visual explainer, plus a small exercise to "spot it in the wild" in apps the learner already uses.
- **Modules:**
  1. Computers, files and folders, programs
  2. Apps vs websites vs "the cloud"
  3. The internet: client and server (a letter and a reply)
  4. Frontend and backend (the dining room and the kitchen)
  5. What code is, and why you don't need to read it
  6. **APIs**: a waiter between programs
  7. **API keys**: a hotel key card. It identifies you, and anyone holding it gets in
  8. Databases: linked spreadsheets that don't forget
  9. Accounts and login
  10. Hosting and domains
  11. Open source and GitHub
  12. AI models: prompts, tokens, cost
- **Project:** *Your first API*: a page that shows live data from a public API with no key, then a second feature that needs a key (e.g., weather or an AI summary), with the key kept safely on the server.
- **Done when:** both features work; the tutor confirms the key **isn't visible** in the page; you draw the trip browser → server → API → back and explain each hop.
- **🚩** "I'll put your API key in the page so it works." What a leaked key costs.

#### Course 2: Think like a builder · ~8h
- **Modules:**
  1. Problem before solution
  2. Who it's for and what they need done
  3. The GTA 6 problem: why big asks fail, for humans *and* agents
  4. The smallest useful version
  5. Slicing
  6. User stories and **"done when"** (acceptance criteria)
  7. Prototype vs product
  8. Writing a brief an agent can follow
  9. Plan mode: asking for a plan and reviewing it before anything is built
  10. Testing each slice yourself, and with 3 real people
  11. Deciding what's next
- **Project:** *Your product, slice 1*: pick your idea, write the one-page brief and the list of slices, then ship slice 1 as a clickable prototype with fake data. Test it with 3 people and write down what you learned.
- **Done when:** brief and slices are in the project; slice 1 runs in the preview; 3 test notes; a decision for slice 2.
- **🚩** The agent builds 15 features in one go and half of them don't work. Recover by going back to one slice.

#### Course 3: Your workshop · ~6h
- **Concepts:**
  - The Claude app in depth: sessions, permission modes, plan mode, the diff view, stop and undo.
  - Anatomy of a project: what README, config files and dependencies are, and which folders you can ignore.
  - Reading an error without panic.
  - **Git and GitHub through the app:** save points, history, branches, pull requests, `.gitignore`, public vs private.
  - The terminal *pane* as a window onto what Claude runs. You read it, you don't type in it.
- **Project:** Put your product on GitHub with a README. Make a change on a branch, open a PR, merge it. Then break something on purpose and roll it back.
- **Done when:** private repo with a README; ≥5 meaningful save points; one merged PR; one deliberate rollback; no secrets in history (tutor scan).
- **🚩** "I'll force-push to fix this." Rewriting history, and why that's a decision you have to approve.

### Level 2: Going live (the production core)

#### Course 4: Going live · ~6h
- **Concepts:** servers vs serverless; deploys; environments (local, preview, production); preview links per PR; DNS, domains and HTTPS; build failures; **environment variables** (the app's settings and secrets, kept outside the code).
- **Project:** Your product live at a URL, with a preview link for every PR. Domain optional.
- **Done when:** production URL is live; a PR produces a preview that differs from production; env vars are set on the host, not in the code.
- **🚩** "Works in the preview pane, blank page online." This is the most common deploy failure: missing env vars.

#### Course 5: Data that survives · ~8h
- **Concepts:** tables, rows, columns, relations; reading, creating, updating and deleting data; schemas and **migrations** (renovating the house while people live in it); seed vs real data; backups and restores.
- **Project:** The next slice of your product uses a real database. Data survives refreshes and deploys.
- **Done when:** you can explain your tables in the visual editor; a schema change shipped as a migration; **you restored a backup into a copy** and saw your data come back.
- **🚩** "I'll drop the table and recreate it."

#### Course 6: Users and permissions · ~8h
- **Concepts:** authentication (who are you?) vs authorization (what can you do?); passwords, magic links, "log in with Google"; sessions; roles; **row-level security**; private file storage.
- **Project:** Login and two roles in your product. Each user only sees their own data.
- **Done when:** login works on production; user A can't read user B's data **even when calling the API directly** (the tutor probes it); RLS is on for every table.
- **🚩** **"RLS is blocking the query, I'll turn it off."** This is how CVE-2025-48757 leaked data from many vibe-coded apps. Tables an agent creates through the API don't get RLS by default.

#### Course 7: Secrets and not getting hacked · ~8h
- **Concepts:** public vs secret keys; what ends up in the browser; "never trust the browser"; checks that run on the server; rate limits; dependency updates; thinking like an attacker; real cases (Tea, the Lovable/Supabase leaks, keys committed to GitHub).
- **Project:** A **security review of your product with the agent**, against the Academy checklist. Fix everything it finds.
- **Done when:** the tutor's checks pass: no secrets in git history or the browser bundle; requests without a session get 401/403; rate limits on costly endpoints; no critical dependency alerts.
- **🚩** A permission or paywall check that only runs in the browser.

### Level 3: A real product

#### Course 8: Connecting to the world · ~8h
- **Concepts:** using other people's APIs (and their keys, limits and docs); webhooks ("they call you"); background jobs; email; **AI features** (choosing a model, prompts, cost per user, rate limits); payments in Stripe test mode, and why the server confirms a payment; "don't charge twice".
- **Project:** Add email notifications and one AI feature to your product. Elective: payments in test mode.
- **Done when:** a real email arrives; the AI feature works and shows its cost per use in the logs; a webhook event changes data; (payments) a test payment unlocks a feature, and editing the page doesn't.
- **🚩** "Payment succeeded" handled only in the browser. An AI endpoint with no usage limit.

#### Course 9: Keeping it alive · ~6h
- **Concepts:** logs; error tracking; uptime checks; analytics and privacy; incidents and rollbacks; **costs** (free tiers, usage-based bills, spend alerts); scheduled backups.
- **Project:** Operate your product: errors tracked, uptime alerts to your phone, spend alerts, weekly backups, a one-page **runbook**. Then an **incident drill**: the tutor breaks something in a preview and you fix it with the agent.
- **Done when:** a test error shows up in Sentry; an uptime alert is received; spend alerts are set; runbook in the repo; drill finished with the cause written down.
- **🚩** "Everything's fine" when no monitoring is set up. Silence isn't health.

#### Course 10: Launch and learn · ~6h
- **Concepts:** first users (where they come from); onboarding; collecting feedback; reading analytics; privacy policy and terms (basics, not legal advice); support; iterating with the Builder's Loop using real data.
- **Project:** Launch to your first 10 users who aren't you. Collect feedback and ship one slice based on it.
- **Done when:** 10 sign-ups; feedback log; a shipped slice you can trace back to user feedback; privacy page live.
- **🚩** Building what *you* want next instead of what users showed you.

### Level 4: Lead

#### Course 11: Leading agents · ~8h
- **Concepts:**
  - Project memory (`CLAUDE.md`), skills and plugins.
  - Tests as **readable specs** ("given this, expect that"), and why you ask the agent to write them.
  - **Checking without reading code:** preview links, tests, screenshots, a second reviewer agent.
  - Parallel sessions and worktrees; long and overnight runs.
  - **The terminal, finally:** "you already know everything it does, here's the faster way". Optional, and never required to graduate.
  - Running agents on a cloud server and steering them from your phone (Julian's own setup as the real example).
- **Project:** Ship a substantial feature **from a brief only**: write it, approve the plan, let it run, then accept or reject it by checking the evidence.
- **Done when:** brief and plan committed; readable tests; acceptance written down with the evidence you checked.
- **🚩** "All tests pass" when tests were skipped or rewritten to pass.

#### Electives (pick ≥1) · ~6h each
- **E1: Build AI agents with Houston.** Turn part of your product's workflow into Houston agents. *This is where the program meets Houston on its own merits.*
- **E2: Payments and subscriptions** (Stripe in depth).
- **E3: Automations and integrations** (Slack, Sheets, calendars, webhooks).
- **E4: Mobile.** Make your product an installable app (a PWA), and what native apps involve.
- **E5: Internal tools for your team** (roles, audit logs, admin panels).

#### Capstone: live, with real users · 2–4 weeks
- **What:** your product (from Course 2 onward), or a new one, **in production with real users for two weeks**. It can be a Houston-based product if the learner took E1.
- **The bar:**
  - custom domain + HTTPS;
  - login, roles, RLS;
  - scheduled backups and **one restore you've tested**;
  - error tracking, uptime and spend alerts;
  - privacy page;
  - `/academy:check capstone` passes;
  - runbook;
  - **≥10 real users who aren't you**, or one real team using it at work.
- **The ship:**
  - a 3-minute demo video;
  - a project page: problem, slices, an architecture diagram, what broke and how you fixed it;
  - a peer review by another learner;
  - a **certificate** (Houston's verified certificates).
  - The best capstones are featured in the series.

---

## 5. The format

### 5.1 What a lesson looks like
Each lesson is one page and takes 10–25 minutes, with the same anatomy every time:
1. **Hook:** a 1–3 minute clip from the series, or a real story (the Tea leak, a surprise bill).
2. **Picture:** an **interactive diagram** you click, step through and toggle ("turn RLS off and watch what leaks").
3. **Tell:** prompt cards to copy into Claude.
4. **Watch:** an **annotated replay** of a real agent session in the Claude app, with callouts: "this is a migration", "read this permission", "🚩 this is what wrong looks like".
5. **Check:** a checklist with the proof for each item, and what the tutor checks automatically.
6. **Explain it back:** 2–3 questions answered in your own words. The tutor gives feedback, not a grade.

Other formats:
- **Concept cards:** one idea, one diagram, about 60 seconds. They double as Shorts and evergreen search pages ("¿Qué es una API?").
- **Glossary:** every term, in both languages, with its picture.
- **Field guides:** red flags, "what does this error mean", a cost cheat-sheet.

### 5.2 How progress is checked (no code tests)
| Kind | Example | Who checks |
|---|---|---|
| **Live probes** | URL is up over HTTPS; `/api/x` without a session gets 401; no secret-looking strings in the page bundle | `/academy:check` in the learner's project |
| **Repo checks** | brief and slices present; `.env` gitignored; no secrets in history; RLS on every table; migrations; runbook | `/academy:check` |
| **Proof artifacts** | test notes from 3 people; restore drill notes; a PR link; screenshot of an alert | the learner submits them, the tutor checks they're plausible |
| **Explain-back** | "draw what happens when someone logs in" | the tutor, as feedback |
| **Human** | capstone demo, peer review | peers, the Houston team |

`/academy:check` prints a ✅/❌ report per course. The site shows progress (stored locally, no account needed). There are badges per course, and **verified certificates** per level and for the capstone.

### 5.3 How the agent fits in: the `academy` plugin
It's a Claude Code plugin, installed from the desktop app's **+** button (plugins work in local desktop sessions), and distributed through a marketplace hosted in this repo.

| Piece | What it does |
|---|---|
| **Tutor instructions** | Written into the project's `CLAUDE.md` by `start`. After each meaningful step Claude adds a short **"What just happened"** note in the learner's language and course vocabulary, with a link to the matching concept card. It never asks the learner to write code. (A custom output style does this better in the CLI; the desktop app doesn't document output styles, so the tutor doesn't depend on one.) |
| `/academy:start <course>` | Sets up that course's project, template, brief and checklist. |
| `/academy:brief` | Helps write a slice brief (Builder's Loop). When the learner asks for something huge, it guides slicing instead of building everything at once. |
| `/academy:explain` | Explains the last action or error at the learner's level, with the matching picture. |
| `/academy:check [course]` | Runs the live probes and repo checks; writes the report. |
| **Red-flag hooks** | Fire every time, *before* the action runs: committing `.env`, turning off RLS, force-push, dropping a table, secrets in browser code, skipped tests. They **pause and teach**: what's about to happen, why it's risky, what to ask for instead. |
| `reviewer` subagent | A second agent that reviews a slice against its "done when" and the security checklist, in plain language. |
| `/academy:drill` | Course 9's incident drill: breaks something on purpose in a preview. |

The skills follow the Agent Skills format (`SKILL.md`), the same convention Houston uses. The tutor could later run inside the Houston app as well (§9).

---

## 6. Languages

- **Both languages are first-class:** every lesson lives as an `en` and an `es` file side by side (Starlight i18n), and ships in both or not at all. A check in CI flags any lesson that exists in only one language.
- **Workflow:** written in one language → the agent drafts the other → a **native speaker edits** it (it isn't published as a raw machine translation). Houston already works this way for its app and site (`check-locales`).
- **One shared glossary** (`glossary.en/es`) decides each term. Rule: teach the English term as well, because the tools are in English. Example: "*desplegar* (deploy)", "*clave de API* (API key)".
- **The tutor speaks the learner's language:** `start` asks once and writes the choice into `CLAUDE.md`.
- **Replays:** recorded with the app in each language where it makes a difference; otherwise one recording with the callouts translated.

---

## 7. The platform

**Decision: Astro + Starlight, in the Houston repo under `academy/` (open source), deployed to `academy.gethouston.ai` on Firebase Hosting in the `gethouston` GCP project (the same setup gethouston.ai uses).**

- **Simple:** a static site with no server, database or accounts. It costs close to nothing and there's very little to break.
- **Built for this:** Starlight has navigation, search, dark mode and **i18n with locale routing** built in. MDX lessons can embed interactive React/SVG diagrams and replay players as Astro islands, which load only where they're used.
- **Open source suits the goal:** it lives in the public Houston repo, so content and translations come in as PRs, Julian's agents can write lessons in parallel, and learners can fork it. License: **CC BY-SA 4.0 for content** (people can reuse it, with credit and on the same terms), **MIT for code and the plugin**.
- **Fits Houston:** a subdomain of gethouston.ai; it reuses Houston's design tokens and links to the existing **certificate system** on gethouston.ai (claim and verify pages) instead of building a new one.
- **Progress:** kept in the browser (localStorage), plus the `/academy:check` report. If accounts are ever needed, Houston's login can be added later.
- **Video:** YouTube embeds.
- **Not chosen:**
  - Building it into the Eleventy website (`website/`): Starlight's docs features and i18n would have to be rebuilt by hand. It sits next to the website in the same repo instead.
  - An LMS: too rigid for interactive diagrams, and the content would be locked in.

---

## 8. The series

The series and the program share one spine: **each course = a run of episodes**. Every episode is **recorded natively in English and in Spanish**, as two takes from one script written in both languages. Neither is dubbed. Scripts live in [`series/`](series/).

| Per course | Format | Use in the program |
|---|---|---|
| **Main episode(s)** (15–25 min) | Julian builds that course's project live, red flags included | Embedded as the hook and the "watch me" walk-through |
| **Shorts** (≤60 s) | One concept card each ("What's an API key?", "RLS in 60 seconds") | Concept cards and glossary, and the main way people discover the program |
| **Story thread** | Julian builds a product of their own through the Builder's Loop all season and launches it in the finale | Shows the program's bar is real |

- **Episode 0:** "Writing code is no longer the skill." DHH's "pencils down" (Rails World 2026), the overnight builds, and what still stops people. It ends at Course 0.
- **Course 2 episodes** can be pure product: Julian turns a viewer's "GTA 6" idea into slices on camera.
- Each video ends with a "do it yourself" link; each lesson starts with the clip.
- A recurring "What broke" episode answers learners' real problems, and those answers become field-guide entries.

---

## 9. Houston's role (distribution without the ad)

- **The program earns trust first.** Every course is useful without Houston.
- **Houston shows up where it fits:**
  - E1 (build AI agents with Houston) and the capstone option;
  - certificates on gethouston.ai;
  - the brand on every page;
  - "Houston, we have a problem" as the name for red flags and incident drills.
- **Big strategic option (Julian's call):** make the **Houston app the learner's workbench** instead of the Claude desktop app, in a later version. Houston already targets non-technical users, has no terminal, comes in es/pt/en, and its agents use the same skills format. What's missing today is a builder mode: work on a code project, a live preview, deploys. If Houston gets that, the Academy becomes Houston's onboarding. Until then, the Claude desktop app is the workbench and the plugin keeps the tutor portable.

---

## 10. The build plan

Sizes assume Julian plus parallel agents, part-time: **S** ≈ 1–3 days · **M** ≈ 1 week · **L** ≈ 2–3 weeks. Every content milestone is bilingual.

| # | Milestone | What's in it | Size |
|---|---|---|---|
| **M0** | Plan approved | This doc, and the answers to §11 | ✅ 2026-10-23 |
| **M1** | **Pilot** | Site skeleton (Astro/Starlight, en/es, private preview); lesson template; glossary v0; Course 0 in full; Course 1 modules 6–7 (API, API key); Course 2 module 3 (GTA 6) with the brief template; `academy` plugin v0 (`start`, `brief`, `check 0`, two red-flag hooks); Episode 0. **5 non-technical testers** (bootcamp alumni), observed. | L · **in progress** |
| **M2** | Visual kit | Diagram components (machines, arrows, requests, tables, the bouncer), replay player with callouts, concept-card template, badges | M |
| **M3** | **Level 1 complete** | Courses 0–3, `check` 1–3, the Builder's Loop in the plugin. **Recommended public beta here:** Level 1 alone already helps people, and that's when distribution starts. | L+ |
| **M4** | Level 2 | Courses 4–7. Most probes live here: env vars, RLS, 401s, bundle scan, history scan | L+ |
| **M5** | Level 3 | Courses 8–10, `drill`, the launch kit | L |
| **M6** | Level 4 + electives | Course 11, `reviewer`, E1 (Houston) first, then E2–E5 one by one | L |
| **M7** | Capstone + first cohort | Capstone flow and certificates; a free cohort (20–30 people, both languages) | L (≈ 8 weeks calendar) |

**Order and why:** the pilot comes first because two bets carry everything: that a non-technical person finishes the first hour without fear, and that the basics lessons actually land. After that, release **level by level, in step with the series**, going public from Level 1.

**Rough total:** about 6 months to the full program, with Level 1 public in about 6–8 weeks.

**Risks:**
- Tools change. Mitigation: concepts first, brands second, replays that are cheap to re-record.
- The desktop app on Windows and Linux. Mitigation: test setup per OS in M1.
- Learners' cost of a Claude plan. Mitigation: state it upfront.
- Translation lag. Mitigation: the CI parity check, and nothing ships in one language only.

---

## 11. Decisions and what's still open

**Decided (2026-10-22/23):**
- Free and open source. The Academy is distribution; Houston makes money elsewhere.
- English and Spanish, written natively, with i18n from day one. **The series is recorded natively in both languages.**
- A program made of courses, comprehensive about the basics (API, API key, and so on).
- No terminal at the start. The workbench is the **Claude desktop app**; "Houston as the workbench" (§9) is a later product decision.
- Product thinking (the Builder's Loop) is part of the core.
- Brand: **Houston Academy** (*From zero to hero / De cero a héroe*).
- **It lives in the Houston repo** (`gethouston/houston`, folder `academy/`), public, next to the website. The tutor installs from the repo's marketplace: `/plugin install academy --marketplace gethouston/houston`.
- **Hosting on GCP:** Firebase Hosting in the `gethouston` project (site `gethouston-academy`, domain `academy.gethouston.ai`), deployed by `.github/workflows/academy.yml` with the same GitHub-to-GCP login the website uses.
- **Julian reviews both languages.**
- Claude only for the path, with an appendix for other tools later.
- A paid Claude plan is OK as a learner requirement.
- Pilot testers come from the Houston bootcamp alumni.
- The content is public from now on, because it lives in the public Houston repo. The **public launch** (announcing it, the series) still happens at Level 1.
- DHH: secondary sources say his switch came around March 2026; quote the Rails World 2026 keynote, not a month.

**M1 status:**

| Piece | State |
|---|---|
| Site skeleton (Astro 7.3.8 + Starlight 0.42.6, en at `/`, es at `/es/`, Houston look) | ✅ in `site/` |
| Lesson components: prompt card, red flag, checklist, illustrative agent session, explain-back | ✅ |
| Interactive diagrams: two computers (publish), API waiter, API key card, GTA 6 slices | ✅ both languages, light and dark |
| Course 0, all 4 lessons + overview | ✅ en + es |
| Course 1: overview, module 6 (APIs, with a live-weather mini-project), module 7 (API keys) | ✅ en + es |
| Course 2: overview, module 3 (the GTA 6 problem) | ✅ en + es |
| Glossary v0 (≈30 terms) | ✅ en + es |
| Locale parity check | ✅ `npm run check:locales`, in CI |
| `academy` plugin v0: `start`, `brief`, `explain`, `check 0`; hooks for secrets in files, `.env` in git, force-push | ✅ validated; hooks unit-tested (14 cases) and tested end to end in a real session |
| Marketplace in the Houston repo (`/plugin install academy --marketplace gethouston/houston`) | ✅ public |
| Deploy workflow to Firebase Hosting on GCP (`.github/workflows/academy.yml`) | ✅ site `gethouston-academy` created; deploys on merge |
| Episode 0 script | ✅ draft, en + es, in `series/` |
| Pilot kit: test plan, observation sheet, invite drafts | ✅ in `pilot/` (invites not sent) |
| Dry-run on a clean Mac and Windows machine with the desktop app | ⏳ needs Julian |
| Site live at `academy.gethouston.ai` | ⏳ merge the PR, then connect the domain |
| 5 pilot sessions | ⏳ |

**Still open (Julian):**
1. **Custom domain:** the Firebase site `gethouston-academy` exists (created 2026-10-23), and merging deploys it to `gethouston-academy.web.app`. To serve it at `academy.gethouston.ai`, add the custom domain in the Firebase console, along with its DNS record.
2. **Review:** read both languages of every lesson before the pilot.
3. **Dry run:** Course 0 on a clean Mac and a clean Windows machine with the Claude desktop app.
