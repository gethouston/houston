---
name: plan-my-social-week
description: "Build your social posting plan for the week. I fill Monday through Friday across your active platforms with a mix of original posts, repurposed content, and engagement blocks. No duplicate angles, no generic filler."
version: 1
category: Marketing
featured: yes
image: megaphone
integrations: [linkedin, twitter, reddit, youtube]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Plan My Social Week

## When to use

- User: "plan this week's social" / "social calendar" / "what should I
  post next week" / "content for {platform} this week".
- Weekly  -  routine-able (Monday 9am).

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Social platforms (LinkedIn, X, Reddit)**  -  the platforms I plan slots for. Required for the platforms in your active mix.
- **YouTube**  -  optional, lets me pull recent videos as repurpose candidates.

If none of your active social platforms are connected I stop and ask you to connect at least the one you post on most.

## Information I need

I read your marketing context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your positioning**  -  Required. Why I need it: every slot has to ladder back to your category and ideal customer, not generic content. If missing I ask: "Want me to draft your positioning first? It's one skill, takes about five minutes."
- **Your voice**  -  Required. Why I need it: the calendar names angles and hooks, those need to sound like you. If missing I ask: "Connect your sent inbox so I can sample your voice, or paste two or three things you've written."
- **Your active platforms and topics**  -  Required. Why I need it: I won't plan for platforms you don't post on. If missing I ask: "Which platforms do you post on, and what topics do you want me to rotate through?"
- **Posting cadence**  -  Optional, default LinkedIn 3 / X 5 / Reddit 2 per week. If missing I ask: "How many posts per week per platform do you want to aim for? If you don't have a number I keep going with the default."

## Steps
<!-- houston-workflow:v1 -->

1. **Read positioning doc**:
   `context/marketing-context.md`. If missing or
   empty, stop, tell user run `set-up-my-marketing-info` first.

2. **Read `config/platforms.json`, `config/voice.md`,
   `config/topics.json`, `config/calendar-cadence.json` (if exists).**
   If `calendar-cadence.json` missing, ask one targeted question:
   > "How many posts per week per platform do you want to aim for?
   > Default: LinkedIn 3, X 5, Reddit 2. I'll write this to
   > `config/calendar-cadence.json`."
   Capture, continue.

3. **Cross-agent read  -  repurpose candidates.** Read
   `outputs.json` (if exists). Filter `type` in
   `blog-post`, `case-study`, `repurposed` created last 14
   days. Become candidate slots (e.g. blog post → LinkedIn
   highlight, YouTube → X thread). File missing, skip
   step  -  no error.

4. **Determine week range.** Default: upcoming Mon-Fri (use
   ISO week; today's week if before Wed, next week if Wed+). Honor
   explicit range from user.

5. **Build plan.** For each day × platform slot:
   - Pick topic from `config/topics.json` (rotate across themes).
   - Pick format: original post / thread / repurpose / reply /
     engagement block (15 min skim + comment on 5 posts).
   - Respect cadence from `config/calendar-cadence.json`.
   - Aim mix: ~60% original, 20% repurposed, 20%
     engagement / replies.
   - Time-of-day hint (LinkedIn 8-10am local, X 11am / 4pm, Reddit
     evening). Note; don't schedule.

6. **Write per-week detail** to `social-calendars/{YYYY-WNN}.md`
   atomically. File structure:
   ```markdown
   # Social Calendar  -  {YYYY}-W{NN}

   **Range:** {Mon date} → {Fri date}
   **Cadence:** {from config}
   **Topics in rotation:** {list}

   ---

   ## Monday

   - **LinkedIn  -  original** · topic: {slug} · angle: {one-line} ·
     suggested skill: `draft-linkedin-post`
   - **X  -  engagement block (15 min)** · comment on 5 posts from
     {handles / hashtags}
   ...

   ## Tuesday
   ...

   (Fri)

   ---

   ## Repurpose candidates pulled from SEO
   - {title} ({type}, created {date}) → {target platform + format}
   ```

7. **Append short summary section** (newest-on-top) to living
   `social-calendar.md` at agent root. Structure:
   ```markdown
   ## Week {YYYY}-W{NN}  -  {Mon date} to {Fri date}
   - LinkedIn: {N} originals + {M} engagement blocks
   - X: {N} threads + {M} replies
   - Reddit: {N} replies
   - Repurpose: {N} candidates pulled
   - Full detail: [social-calendars/{YYYY-WNN}.md](social-calendars/{YYYY-WNN}.md)
   ```
   Read existing file, prepend (don't overwrite), atomic write.

8. **Append to `outputs.json`**  -  new entry, `type:
   "social-calendar"`, `title: "Social calendar  -  {YYYY-WNN}"`,
   `path: "social-calendars/{YYYY-WNN}.md"`, `status: "draft"`.

9. **Summarize to user**  -  one paragraph: week range, total
   slots per platform, nudge: "Want me to draft any of these
   now? Say `draft the Monday LinkedIn from the calendar`."

## Outputs

- `social-calendars/{YYYY-WNN}.md`
- Appends week section to `social-calendar.md` (living doc).
- Appends to `outputs.json` with `{ id, type: "social-calendar",
  title, summary, path, status: "draft", createdAt, updatedAt }`.
