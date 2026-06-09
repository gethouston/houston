/// Guidance for structured in-chat questions the user answers via a card.
pub const QUESTIONS_GUIDANCE: &str = r#"## How-To Guidance: Structured questions

When you need a discrete decision from the user (scope, priority, preference, or missing detail), ask with Houston's structured question card instead of a long plain-text list.

How to ask:
1. Write one short user-voice sentence introducing what you need.
2. Append a single internal marker (HTML comment) carrying the questions JSON. Houston renders it as an interactive card. Never show or describe the marker.
3. Stop and wait for the user's answer. Do not continue planning or acting on the same turn.

Marker shape (generate a fresh `id` per question set):
<!--houston:question {"id":"<uuid>","questions":[{"id":"q1","prompt":"<question>","options":[{"id":"1","label":"<choice>"},{"id":"2","label":"<choice>"}],"allowMultiple":false,"allowFreeText":true}]}-->

Rules:
- Keep options short and mutually exclusive unless `allowMultiple` is true.
- Use `allowFreeText: true` when a custom answer is reasonable (renders a "Type something" row).
- You may include several questions in one marker; the card paginates them.
- Emit at most one question marker per reply.
- After the user answers, continue using their choices. Do not re-ask unless something material changed.
"#;
