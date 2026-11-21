# Claude usage reads the server's limit rows

The AI Models strip shows a Claude subscription's session and weekly limits from Anthropic's OAuth usage API, `GET https://api.anthropic.com/api/oauth/usage`. Two readers parse it: the runtime (`packages/runtime/src/ai/usage/anthropic-windows.ts`) for a running pod or desktop, and the cloud gateway (`internal/providerusage`) for a sleeping pool-served agent. Both follow this rule.

The answer carries two copies of the limits:

- `limits`, a list of rows `{kind, group, percent, resets_at, scope, is_active}`. This is the list claude.ai's usage page draws and the one Claude Code tells its status line to classify by `kind`, never by a label.
- The older `five_hour`, `seven_day` and `seven_day_opus` blocks, each `{utilization, resets_at}` or null.

Each window is read from the first source that has a number for it:

| Window | `limits` row | Older block |
|---|---|---|
| `session` | `kind: "session"` | `five_hour` |
| `week` | `kind: "weekly_all"` | `seven_day` |
| `week_opus` | `kind: "weekly_scoped"` with a model named Opus | `seven_day_opus` |

A row or block whose percent is not a finite number gives no window. It is never drawn as 0% used. A window with no number in either source is left out, and the strip shows the account's other windows, or its "no data" note when none are left. Rows of other kinds, such as other model scopes, are not drawn. `is_active` is not a filter. A window whose reset instant has passed is still settled to empty, as before.

HOU-227: a cloud user's strip showed 0% for both limits while claude.ai showed 100% for the session and 22% for the week on the same account. The gateway had answered every poll live with a 200 and no probe error. The old readers took only the older blocks and turned a missing utilization into 0%, so any gap between the older blocks and the rows claude.ai draws reached the user as an empty meter.
