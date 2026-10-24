---
name: explain
description: Explain, in plain words, what Claude just did or what an error means, at a non-technical Houston Academy learner's level. Use when the learner types /academy:explain, or asks "what just happened?", "what does this mean?", or is confused by an error or a permission request.
argument-hint: "[optional: the thing to explain]"
---

# Explain it in plain words

Explain **$ARGUMENTS**. If that's empty, explain the last thing that happened in this session: the last action, permission request, or error.

Use the learner's language (`.academy/profile.json`, default English). No code. If a technical word is unavoidable, explain it the first time, and use the Academy's words (API, API key, server, client, publish, localhost, slice…).

Answer in this shape, short:

1. **What happened**: one or two sentences, with an everyday comparison (a waiter, a key card, a letter and its reply, a copy on another computer).
2. **Why it matters**: one sentence. Is it normal, or a 🚩 red flag?
3. **What to do now**: only if something needs doing. One or two concrete steps, or the exact words to send to Claude.

If it's an error, say plainly whether anything is broken or lost (usually not), and that errors are normal while building. If the learner seems worried, reassure them first.

If there's an Academy lesson about it, name it (for example: Course 1, "APIs"; Course 1, "API keys"; Course 0, "Put it on the internet").
