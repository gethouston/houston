# Research notes: what exists, and what's missing

Collected 2026-10-22 to inform `PLAN.md`. Most sources are third-party; numbers that come from a single source are flagged. Prices change, so check them again before quoting any in public.

## 1. Learn-to-code platforms (the reference points)

| Platform | What it is | What we borrow | Why it doesn't fit our learner |
|---|---|---|---|
| **The Odin Project** | Free, open-source, project-based full-stack curriculum (HTML/CSS/JS, Git, Node, React or Rails). Foundations assumes zero experience. Lessons are reading assignments that link out to other material, then a project. Discord community. [FAQ](https://theodinproject.com/faq), [about](https://TheOdinProject.com/about), [curriculum repo](https://github.com/TheOdinProject/theodinproject) | A projects-only spine, the curriculum lives in a public repo, and a community where people help each other | Everything teaches *writing* code. It's mostly text and links, with little that is visual |
| **boot.dev** | Self-paced backend curriculum (Python, Go, TS), text-first and interactive. Game layer: XP, levels, quests. About $399/yr; third-party sources disagree on the monthly price ($33 vs $59). A DevOps path launched March 2026 (14 courses + 4 projects). [pricing](https://boot.dev/pricing), [directory](https://www.techinterview.org/bootcamp_directory/p/boot-dev/), [DevOps path review](https://www.toolshero.com/featured-posts/7-best-devops-courses/) | Game mechanics that keep people coming back, a clear path, a free tier (the first chapters are interactive) | It grades you by running tests on code *you* wrote. Our learner doesn't write code |
| **freeCodeCamp** | Donation-funded nonprofit. v10 curriculum: 6 certifications, each with a dozen or more projects and a final exam. The full-stack capstone is reviewed by a developer. [v10 update](https://www.freecodecamp.org/news/freecodecamp-turns-10-major-curriculum-updates), [review](https://skillscouter.com/freecodecamp-review/) | Free verified certificates, and a capstone reviewed by a human | Reviews say it is "sparse on explanation" and that beginners get stuck |
| **Scrimba** | "Scrims": recorded screencasts you can pause and edit, because the code in the video is live. AI Engineer path (OpenAI API, RAG, agents, MCP) is for intermediate web developers, about $49/mo per a directory. [path](https://m.scrimba.com/learn/aiengineer), [directory](https://www.techinterview.org/bootcamp_directory/p/scrimba-ai-engineer-path/) | **Video you can interact with.** Our version: annotated replays of real Claude Code sessions | It is built around an editor, for developers |

## 2. Vibe-coding courses

- **Class Central** says there are 80+ vibe-coding courses ([report](https://www.classcentral.com/report/best-vibe-coding-courses/)). Udemy has many short ones, e.g. "Vibe Coding for Non-Coders" ([link](https://www.udemy.com/course/vibe-coding-for-non-coders-zero-to-hero/)) and "From Prompt to Production" (2h, with a security focus, few ratings) ([link](https://www.udemy.com/course/learn-to-vibe-code-and-deploy-your-projects/)).
- **Designlab Vibe Coding Camp:** 4 weeks, live cohort, $999, for designers. Ends with deploying through GitHub and Vercel ([link](https://designlab.com/advanced/vibe-coding-course)).
- **Product School Vibe Coding Certification:** for PMs, cohort-based, includes a "deploy to a live URL" module ([link](https://productschool.com/courses/vibe-coding-certification)).
- **Vibe Coding Academy:** self-paced Lovable + Cursor course (auth, DB, payments), plus a live "Ship your first SaaS with Claude Code" cohort ([link](https://www.vibecodingacademy.ai/)).
- **Google AI Professional Certificate:** added a vibe-coding course for people with no technical background, covering planning, testing and deploying ([Google blog](https://blog.google/company-news/outreach-and-initiatives/grow-with-google/vibe-coding-course/)).
- **Claude Code for Everyone** (Carl Vellotti): a free course of about 3 hours, taught inside Claude Code itself, with guides by role (marketers, writers, PMs, founders). Module 2 has "GitHub" and "Go Live" lessons. Its main focus is knowledge work rather than production apps ([guides](https://ccforeveryone.com/guides)). **It's the closest match to our idea.** We should take from it the idea of teaching *inside* the agent.
- **Courses on Claude Code for PMs or designers:** e.g. a Maven course that "assumes you've never opened a terminal" ([link](https://maven.com/jules-boiteux/claude-code-for-pms)), a designer guide ([link](https://nervegna.substack.com/p/claude-code-for-designers-a-practical)), and a PM guide ([link](https://cc.bruniaux.com/guide/for-product-managers/)).

**The pattern:** these courses are built around a tool (Lovable, Cursor, Bolt), stop once the first app is deployed, and cover production as one module or as marketing copy. A search for reviews summed it up: "the demo always works. Production rarely does" ([DEV](https://dev.to/kongkong1/lovable-is-valued-at-132b-but-most-vibe-coders-still-cant-ship-real-software-51po)). Simon Willison warns that good-enough prototypes get pushed into production ([blog](https://simonwillison.net/2025/Mar/6/vibe-coding)).

## 3. Anthropic's own material

Anthropic Academy on Skilljar is free and English only ([catalog](https://anthropic.skilljar.com/)). It has Claude 101, **Claude Code 101 (for developers)**, Claude Code in Action (for developers running long unattended sessions), Intro to agent skills, Intro to subagents, Claude Cowork, and the AI Fluency series, including **"AI Fluency for Builders"** and one for small businesses. In the catalog, Claude Code 101 targets *developers* and AI Fluency stays at the concept level. **No course teaches non-developers to take an app to production.** Third-party summaries: [pillitteri](https://pasqualepillitteri.it/en/news/371/anthropic-academy-free-courses-claude), [blogdumoderateur](https://www.blogdumoderateur.com/anthropic-academy-comment-se-former-gratuitement-ia-claude/).

Claude Code features useful for a tutor, from the [output-styles docs](https://code.claude.com/docs/en/output-styles):
- The built-in **Explanatory** style adds "Insight" blocks, and **Learning** asks the user to write code. Learning doesn't fit our learner.
- **Plugins can ship custom output styles**, skills, hooks and subagents. `force-for-plugin: true` turns a style on automatically when the plugin is enabled.
- Hooks are the right tool for anything that must *always* happen, e.g. catching a risky action and explaining it.
- Plugins are distributed through a marketplace that is just a git repo ([discover plugins](https://code.claude.com/docs/en/discover-plugins), [marketplaces](https://code.claude.com/docs/en/plugin-marketplaces.md)).

## 4. What non-technical builders get stuck on (evidence)

**The terminal, localhost and GitHub**
- A guide for founders says not to start with Cursor, because it "requires you to understand file systems, terminal commands, and localhost deployment" ([Atarim](https://atarim.io/the-non-technical-founders-guide-to-vibe-coding/)). Another tells learners to ask the AI to run every git command because "I do not want to use the terminal" ([Medium](https://brianjenney.medium.com/vibe-coders-playbook-for-launching-without-learning-to-code-1dc1222625bf)).
- "Vibe coding ends at localhost": "A folder of code on your machine is not a product. It runs at localhost:3000 for an audience of exactly one" ([HackerNoon](https://hackernoon.com/vibe-coding-ends-at-localhost)).
- A Stack Overflow blog post follows a non-coder who couldn't use the AI's explanation of a bug ("API endpoints not being served at the root level") ([SO blog, Jan 2026](https://stackoverflow.blog/2026/01/02/a-new-worst-coder-has-entered-the-chat-vibe-coding-without-code-knowledge/)). **The vocabulary gap is the blocker, not the code.**
- A first-person account: their app was messy partly because of "no experience using GitHub" ([Substack](https://kathomuth.substack.com/p/my-last-week-and-a-half-a-vibe-coding)).
- A localhost → GitHub Pages deploy broke images in production because of path differences ([Medium](https://medium.com/@widsonambaisi/case-study-vibe-coding-a-react-website-from-localhost-to-github-pages-and-what-broke-along-the-0b7a31425e99)).

**Environment variables and secrets**
- "Undefined" errors and blank pages after a deploy, because env vars weren't set on the host. `NEXT_PUBLIC_` variables are compiled into the browser bundle, and a service-role key ended up in client code ([selfmadenewbie checklist](https://selfmadenewbie.com/how-to-launch-vibe-coded-app/), [DEV: data leak](https://dev.to/mgundlach/your-vibe-coded-app-already-has-a-data-leak-and-the-code-compiles-fine-1d78), [Substack: committed API key](https://juliadiez.substack.com/p/vibe-coding-is-fun-until-you-commit)).
- A paywall checked only in the browser was bypassed by editing the JS (anecdotal, [vibeappscanner](https://vibeappscanner.com/vibe-coding-disasters)).

**Data security (the big one)**
- **CVE-2025-48757:** Lovable-generated apps with missing or weak Supabase Row Level Security let unauthenticated users read and write arbitrary tables. Supabase now enables RLS by default in its Table Editor, **but tables created through the API, which is how agents create them, don't get it by default** ([Pluto Security](https://blog.pluto.security/p/cve-202548757-what-happened-why-it-b22), [Intruder](https://cvemon.intruder.io/cves/CVE-2025-48757)).
- Scans (each figure from one source): 39 of 1,072 vibe-coded apps had tables readable with the public key. 28% of 107 YC startups exposed personal data. 12% of 100 apps exposed Supabase credentials. A Lovable-showcased app exposed about 15k emails, and Lovable disputed how it was framed ([rankiteo summary](https://blog.rankiteo.com/mussup1772216763-supabase-lovable-vulnerability-february-2026/)).
- **Tea app (July 2025):** an unauthenticated Firebase storage bucket leaked about 72k images (including about 13k selfies and IDs) and over 1.1M messages. How much vibe coding was to blame is disputed ([Decrypt](https://decrypt.co/331961/tea-app-claimed-protect-women-exposes-72000-ids-epic-security-fail), [Fortune](https://dc.fortune.com/2025/07/26/tea-app-hack-images-online-leaks-users-selfies), [Simon Willison](https://simonwillison.net/b/8861)).

**The ceiling**
- GitHub's CEO: a non-technical founder "will find it difficult to build a startup at scale without developers" ([AOL/BI](https://www.aol.com/githubs-ceo-says-startups-only-134128119.html)). Our course argues against this, but the specific gaps it names (ops, security, scale) are what our curriculum covers.

## 5. The premise check

- **DHH:** at Rails World 2026 he said 37signals is "done writing code by hand". Agents generate nearly all of its code, and hand-written code is now the exception ([Pragmatic Engineer, 2026-09-24](https://newsletter.pragmaticengineer.com/p/the-pulse-end-of-coding-by-hand), [keynote summary](https://dealroom.co/news/talk-vDjW_dRyKXY-pencils-down-dhh-declares-the-end-of-hand-written-code)). ⚠️ Secondary sources date his own last hand-written production code to about **March 2026**, not January. Check the keynote recording before quoting a month on camera.

## 6. Naming and the tools learners use (added 2026-10-23)

- **"Vibe Academy" is close to an existing competitor:** Vibe Coding Academy (vibecodingacademy.ai) sells a $299 master course and a Pro plan. It has screencasts, prompts and diagrams, live cohorts on Claude Code, Cursor and Lovable, and **"Emily", an AI tutor that works inside your coding environment** ([Product Hunt](https://www.producthunt.com/products/vibe-coding-academy/launches/meet-emily-your-ai-vibe-coding-coach), [site](https://www.vibecodingacademy.ai/vibe-coding-academy-vs-codecademy)). A separate "VibeCode Academy" also exists ([Product Hunt](https://www.producthunt.com/products/vibecode-academy/makers)). Our differences: free, open source, bilingual, production-grade, and a product method.
- **"Houston Academy"** is the name of K-12 schools in Dothan, AL and Houston, TX ([Wikipedia](https://en.wikipedia.org/wiki/Houston_Academy)). There's no overlap in edtech or software.
- **The Claude desktop app's Code tab** works on local folders with no terminal. It has a Browser pane that runs and previews the app, permission modes in the UI (including Plan), a diff view with line comments, PR creation with CI status (needs `gh`), and plugins installed from the **+** button (local sessions only, not cloud or WSL). Linux is in beta. The docs don't mention output styles ([desktop docs](https://code.claude.com/docs/en/desktop)).
- **Houston already has** (from the gethouston/houston repo, read locally):
  - a desktop app for non-technical users ("No terminal"), localized en/es/pt;
  - agents with `CLAUDE.md` + `.agents/skills/<name>/SKILL.md`;
  - a Spanish bootcamp landing page (`/bootcamp/`), a verified-certificates system (`/certificates/`), and a short `/learn/` guide series ([gethouston.ai/learn](https://gethouston.ai/learn/));
  - a website built with Eleventy on Firebase Hosting.

## 7. The gap, in one line

Coding schools teach the skill that is being automated. Vibe-coding courses teach a tool and stop at the demo. Anthropic teaches developers. **Nobody teaches non-technical people the world around the code (git, servers, data, auth, secrets, deploys, ops) to production grade, visually, with the agent as tutor inside their own project.**
