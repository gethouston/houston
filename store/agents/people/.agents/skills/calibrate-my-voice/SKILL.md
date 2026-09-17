---
name: calibrate-my-voice
description: "Sample your past HR comms  -  offers, check-ins, hard conversations  -  so I can match your tone in every draft. Connect Gmail or Outlook for the sharpest fingerprint, or paste three to five examples."
version: 1
category: People
featured: no
image: busts-in-silhouette
integrations: [gmail, outlook]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Calibrate My Voice

Offers, rejections, team announcements, performance improvement plans (PIPs), stay conversations  -  every skill this agent drafts against your voice. Skill samples how you actually write HR comms, writes tone fingerprint into `context/people-context.md` that every downstream draft references.

## When to use

- "calibrate my HR voice" / "sample my past offers" / "learn how I write for HR comms".
- "refresh voice notes in people-context doc".
- Called implicitly by `set-up-my-people-info` when voice-notes section thin or stale.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Inbox (Gmail, Outlook)** — sample your past HR-adjacent sent messages. Required when you want me to pull samples.

If no inbox is connected I ask once whether to sample from a connected inbox or take three to five pasted samples instead.

## Information I need

I read your people context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Voice samples** — Required. Why I need it: every fingerprint bullet traces to real samples. If missing I ask: "Connect your inbox so I can pull 10 to 20 recent HR messages, or paste three to five samples here."
- **Sample scope** — Optional. Why I need it: lets me filter to candidate or team comms. If you don't have it I keep going with the broadest HR-adjacent set I can find.
- **Hard-news samples** — Optional. Why I need it: rejections and PIP intros register differently from celebratory notes. If you don't have it I keep going with TBD on the hard-news fingerprint.

## Steps
<!-- houston-workflow:v1 -->

1. **Read people-context doc** (own file): `context/people-context.md`. Read existing voice-notes section so run = append/merge, not overwrite. If doc missing, run `set-up-my-people-info` first.

2. **Pick source  -  ask ONE tight question if not obvious, with modality hint:**
   - "I can pull 10-20 recent HR-ish outbound messages from connected inbox, or paste 3-5 samples. Which?"
   - Connected: run `composio search inbox`; identify sent messages tagged with HR-relevant recipients (candidates, team); fetch.
   - Pasted: take paste verbatim.

3. **If connected, fetch.** Execute discovered inbox tool's list-sent-messages slug. Filter to HR-adjacent messages  -  candidates, employees, team-wide announcements. If inbox can't distinguish, ask for label/folder name or date window. Capture: send date, recipient role (inferred), subject, body.

4. **Extract tone fingerprint.** Per sample, note:
   - **Greeting pattern**  -  "Hey {name}," vs "Hi {name}  - " vs "{name},"
   - **Closing pattern**  -  "Talk soon,", " - {firstname}", "Best,".
   - **Sentence length**  -  average + range.
   - **Formality level**  -  1 (casual) to 5 (formal).
   - **Forbidden phrases**  -  what founder never says (e.g. never "circle back", never "synergy", never "reach out").
   - **Quirks**  -  em-dashes vs commas, one-line paragraphs vs dense, emoji usage, signoff variations, how they deliver hard news.
   - **Hard-news register**  -  how they write rejections, layoff notices, PIP intros. Different from celebratory messages; capture separately.

5. **Synthesize across batch.** Roll into 4-6 bullets:
   - Greeting habits.
   - Sentence length/cadence preference.
   - Formality level.
   - Forbidden phrases.
   - Hard-news register.
   - Any distinctive quirk.

   Plus 3-5 verbatim excerpts (short  -  2-3 sentences each) exemplifying voice.

6. **Append to voice-notes section of `context/people-context.md`.** Do NOT overwrite section  -  merge. Preserve anything founder already sharpened. Write atomically to `context/people-context.md.tmp` then rename.

7. **Also refresh `config/voice.md`**  -  same fingerprint, same verbatim excerpts, so future skills read locally without re-parsing shared doc. Atomic write.

8. **Append to `outputs.json`.** Read-merge-write atomically  -  summary entry pointing at update, not standalone file:

   ```json
   {
     "id": "<uuid v4>",
     "type": "voice-calibration",
     "title": "Voice calibrated  -  <YYYY-MM-DD>",
     "summary": "<2-3 sentences  -  N samples mined, top 3 fingerprint notes, what changed in context/people-context.md>",
     "path": "context/people-context.md",
     "status": "ready",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

   (Entry points at live doc since no standalone artifact  -  voice notes live inside `context/people-context.md`.)

9. **Never invent.** Every quirk/fingerprint bullet must trace to actual samples. If sample set too thin (< 5 messages), say so and stop  -  shaky fingerprint worse than none.

10. **Summarize to user.** One paragraph: N samples mined, top 3 fingerprint bullets, where landed in people-context doc, what other agents now draft better.

## Outputs

- Updates voice-notes section of `context/people-context.md` (live doc).
- Refreshes `config/voice.md` with new fingerprint + excerpts.
- Appends to `outputs.json` with `type: "voice-calibration"`.