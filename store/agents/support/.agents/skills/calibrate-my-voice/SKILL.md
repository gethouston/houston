---
name: calibrate-my-voice
description: "Pull your recent customer replies from your connected inbox, read how you actually write, and distill it into a voice profile that every future draft matches. Catches your greeting style, sentence rhythm, sign-off, favorite phrases, and the corporate fluff you never use. After this runs, every reply, article, and lifecycle message sounds like you wrote it."
version: 1
category: Support
featured: no
image: headphone
integrations: [gmail, outlook]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Calibrate My Voice

## When to use

- "calibrate my voice" / "train on how I write" / "pull my sent replies."
- After `set-up-my-support-info` when voice section is `TBD`.
- Re-run when tone drifted or want re-learn from recent replies.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Inbox** (Gmail / Outlook)  -  pull 10 to 20 of your recent sent replies. Required.
- **Support helpdesk** (Intercom / Help Scout / Zendesk)  -  alternate source if you reply from a helpdesk instead of email. Required if helpdesk is your primary channel.

If neither is connected I stop and ask you to link the inbox or helpdesk you actually reply from. If you'd rather paste samples I'll switch to that.

## Information I need

I read your support context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Source of voice samples**  -  Required. Why I need it: I either pull from a connected inbox or you paste them; I don't guess. If missing I ask: "Want me to pull your last 10 to 20 customer replies from a connected inbox, or would you rather paste 3 to 5 examples here?"
- **Forbidden phrases**  -  Optional. Why I need it: phrases that sound wrong coming from you go on a never-use list. If you don't have it I keep going with TBD and infer from samples.

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/support-context.md`.** If missing, run `set-up-my-support-info` first (or stop and tell me).

2. **Discover connected inbox.** Run `composio search inbox` or `composio search email-sent` (try both  -  exact slug depend on linked provider: Gmail, Outlook, Intercom, Help Scout, Zendesk, etc.). No inbox connected → tell me category to link (connect one: Gmail, Outlook, Intercom, Help Scout, Zendesk) and stop.

3. **Pull 10-20 recent outbound replies.** Execute list-sent / search-sent tool slug. Filter to support-looking replies (thread depth > 1, or label/folder contain `support`, or recipient not internal). Aim 10-20 most recent.

4. **Extract tone cues from samples:**
   - Greeting pattern (e.g. "Hey Jane," vs "Hi," vs no greeting).
   - Sentence length  -  short / medium / long.
   - Formality  -  casual / professional / direct.
   - Signature / sign-off convention.
   - Repeated phrases or quirks ("I'll dig in," "to be clear," em-dash use, etc.).
   - Forbidden-sounding phrases wrong coming from them (e.g. "I apologize for the inconvenience").

5. **Write `config/voice.md`** atomically. Include:
   - One-paragraph tone summary (direct / warm / human, specific traits).
   - 3-5 verbatim excerpts (shortest-but-most-representative) with PII redacted via `{Customer}` / `{Email}` placeholders.
   - "Forbidden phrases" bullet list.

6. **Update `context/support-context.md`.** Read current doc, find Tone + voice section, replace with 2-sentence summary pointing to `config/voice.md` for full detail. Write atomically (`.tmp` → rename).

7. **Update `universal.voice` in `config/context-ledger.json`**  -  `summary`, `sampleSource`, `sampleCount`, `capturedAt`.

8. **Append to `outputs.json`** with `type: "voice-calibration"`, `domain: "quality"`, title "Voice calibrated from {N} samples", summary = 2 sentences, path = `config/voice.md`, status `ready`.

9. **Summarize to me.** One paragraph: what tone look like ("direct, warm, em-dash heavy; never apologizes for inconvenience") and one line reminding every draft reply, lifecycle message, and article in this agent now pulls from this.

## Outputs

- `config/voice.md` (raw samples + tone summary)
- `context/support-context.md` (voice section summary pointer)
- `config/context-ledger.json` (`universal.voice` block)
- Appends to `outputs.json` with `type: "voice-calibration"`, `domain: "quality"`.
