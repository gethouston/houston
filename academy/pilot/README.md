# M1 pilot: test plan

**The question:** can a non-technical person get through the first hour without fear, and do the basics lessons (API, API key, the GTA 6 problem) actually land?

**Who:** 5 people from the Houston bootcamp alumni, with no coding background. Mix of roles (PM, design, ops, founder) and both languages (at least 2 in each).

**Format:** one 90-minute session per person, on a video call with screen sharing, on their own computer. One facilitator, who talks as little as possible. Record if they agree.

## Before the pilot (blocking)

- [ ] **Deploy the site.** Merging to `main` deploys `academy/site` to Firebase Hosting (GCP project `gethouston`, site `gethouston-academy`) through `.github/workflows/academy.yml`. One-time setup first: create the Firebase site, then add the `academy.gethouston.ai` custom domain and its DNS record.
- [x] **Plugin installable by testers:** the Academy lives in the public `gethouston/houston` repo, so `/plugin install academy --marketplace gethouston/houston` works for anyone.
- [ ] **Dry-run Course 0 on a clean Mac and a clean Windows machine** with the Claude desktop app, and check the things we couldn't check from the server:
  - the plugin install prompt card works in the desktop app;
  - the Spanish UI labels in the desktop app match the lessons (e.g. the "Allow" button);
  - the Browser pane opens `index.html`;
  - Vercel Drop's current steps match lesson 3.
- [ ] Each tester has a paid Claude plan (or we provide one for the session).

## Session script (90 min)

| Time | What happens | Facilitator watches for |
|---|---|---|
| 0–5 | Welcome. "We're testing the course, not you. Think out loud." Consent to record. | |
| 5–65 | **Course 0, lessons 1–4**, following the site on their own | Where they hesitate, what they ask, every permission request: do they read it? Time per lesson. |
| 65–80 | **Course 1, lesson 6 (APIs)**, through the weather section | Do they explain "API" correctly afterwards, unprompted? |
| 80–85 | Course 2, lesson 3 (GTA 6): read it, and slice their own idea with the prompt card | Do the slices come out as "a person can…"? |
| 85–90 | Debrief questions (below) | |

The API keys lesson is reading only (no key needed). Ask testers to read it at home and answer the explain-back questions within 2 days, then send their answers.

## Debrief questions

1. At what moment did you feel most lost? Most confident?
2. In your own words: what is publishing? What is an API? Where should an API key live?
3. Was there a permission request you didn't understand? What did you do?
4. Did the "What just happened" notes help, or get in the way?
5. Would you continue to Course 1 on your own? What would stop you?

## What success looks like

- **4 of 5** finish Course 0 with a live URL on their phone, in **under 75 minutes**, without the facilitator touching their computer.
- **4 of 5** explain "publishing" and "API" correctly afterwards.
- **0** clicks on a permission request they say they didn't understand. Each one is a fix to make in the lessons.
- Every place 2 or more testers got stuck becomes an issue, fixed before M3.

## Observation sheet

Copy one per tester into `pilot/notes/<tester-id>.md` (use an id, not their name):

```
Tester: T1 · Role: · Language: · OS: · Date:
Lesson 1: time __ · stuck at: · quotes:
Lesson 2: time __ · permission requests read? Y/N · stuck at: · quotes:
Lesson 3: time __ · stuck at: · quotes:
Lesson 4: time __ · /academy:check result: · quotes:
APIs: explained correctly? Y/N · their words:
GTA 6: their idea → slices:
Debrief answers:
Fixes to make:
```
