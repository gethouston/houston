---
name: check
description: Check whether a Houston Academy learner finished a course project, by looking at the real thing (the live page, the folder), never by grading code. Writes a short report to .academy/reports/. Use when the learner types /academy:check.
argument-hint: "[course number, e.g. 0]"
disable-model-invocation: true
---

# Check a course

Check course **$ARGUMENTS** (if empty, use `course` from `.academy/profile.json`). Talk in the learner's language (`.academy/profile.json`, default English), in plain words.

This is feedback, not an exam. Check what you can yourself, ask about the rest, and be warm and specific.

## Course 0: Hello, internet

Run these checks:

1. **The page is in the folder.** There is an `index.html` in the project folder. Note its title (the `<title>`, or the main heading).
2. **The page is on the internet.** Ask for the address of their published page, unless `.academy/profile.json` already has `site_url`. Save it there as `"site_url"`. Fetch it, for example with `curl -sL -o /dev/null -w "%{http_code} %{url_effective}" <address>`, and also fetch the page itself:
   - ✅ the address starts with `https://`;
   - ✅ it answers with status 200;
   - ✅ the published page shows the same title or heading as their local `index.html`. If it's different, they probably published an older copy: that's fine, tell them how to publish again (drag the folder to vercel.com/drop).
3. **Nothing private was published.** Look at the files in the folder: no passwords, keys, or personal documents. (`CLAUDE.md` and `.academy/` are fine: they hold only the tutor's notes.)
4. **Explain it back.** Ask one question and wait for the answer: "In one sentence, what does 'publishing' mean?" Give kind feedback: a good answer says the files were copied to another computer that's always on (a server), so anyone with the address can open it. Never mark it as failed. If it's incomplete, add the missing piece.
5. **On their phone.** Ask them to confirm they opened the address on their phone. Take their word for it.

## Other courses

The pilot only has checks for course 0. For any other course, say so kindly, and point them to the "Done when" checklist at the end of the course's lessons on the Academy site.

## Report

Write `.academy/reports/course-<n>.md` in the learner's language: the date, each check with ✅ or ❌ and one line on why, and what to do for any ❌.

Then tell the learner the result in 3–5 lines: what passed, what (if anything) to fix and exactly how, and, if everything passed, congratulate them and point to what's next. For course 0, that's Course 1, lesson 6: "APIs".
