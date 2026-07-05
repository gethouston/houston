/// Integrations guidance for the TS engine (pi runtime), where the agent has
/// the in-process `integration_search` / `integration_execute` tools and NO
/// provider CLI. The connect hand-off is the `#houston_toolkit=<slug>` link
/// the chat renders as a rich connect card (HOU-670). Keep in sync with the
/// `INTEGRATIONS` section of packages/host/src/houston-prompt.ts.
pub const PI_INTEGRATIONS_GUIDANCE: &str = "\n\n---\n\n\
## How-To Guidance: Connected Apps (Integrations)\n\n\
You can act on the user's apps (Gmail, Google Calendar, Slack, Notion, and \
many more) with two tools: `integration_search` finds an action and its \
input parameters; `integration_execute` runs it. Search first, then \
execute. The user's own account is used automatically - you never handle \
credentials.\n\n\
When a needed app is not connected yet (search marks its actions NOT \
CONNECTED, or execute fails because no account is linked):\n\n\
1. Briefly say what must be connected and why, in plain language.\n\
2. Offer the connection right in chat: include a markdown link whose URL \
   ends with `#houston_toolkit=<toolkit>`, written exactly like \
   `[Connect Gmail](https://gethouston.ai/connect#houston_toolkit=gmail)`. \
   Houston renders it as a rich connect card with a one-click button. Use \
   the toolkit slug from the search results, one link per app that needs \
   connecting.\n\
3. Do NOT ask the user to tell you when they're done, and do NOT promise \
   to \"check\" the connection yourself. Houston detects the moment the \
   connection goes live and automatically sends you a short message \
   (e.g. \"I've connected Gmail. Please continue.\") so you can resume the \
   task on your own. Phrase your message to set that expectation, e.g. \
   \"Once you approve access in the browser, I'll keep going from here \
   automatically.\" Then stop and wait.\n\n\
Never read the link URL, fragment, or toolkit slug out loud to the user, \
and never name the integrations provider - the card speaks for itself.";

/// Composio CLI integration guidance, including rich connect-card links.
/// (Default Rust-engine build only — host-sidecar builds compile out its
/// caller, `system_prompt`.)
#[cfg_attr(feature = "host-sidecar", allow(dead_code))]
pub const COMPOSIO_GUIDANCE: &str = "\n\n---\n\n# Integrations - Composio CLI\n\n\
When a task needs a connected app or account, prefer Composio when a suitable tool exists. \
Search Composio before using another integration path. \
Quick reference:\n\
- `composio search \"<what you want to do>\"` - find the right tool\n\
- `composio execute <TOOL_SLUG> -d '{ ... }'` - run a tool\n\
- `composio execute <TOOL_SLUG> --get-schema` - see required params\n\n\
Search first, inspect the schema when needed, then execute only after the \
interaction procedure says the task is ready.\n\n\
## When the user is not signed into Composio at all\n\n\
If `composio search` / `composio execute` / `composio link` fails with an \
authentication / login / not-signed-in error (the user has no Composio \
session at all, not just a missing per-toolkit connection), DO NOT tell \
the user to open settings or visit a website. Instead, post a Composio \
sign-in card directly in chat by writing the markdown link exactly as: \
`[Sign in to Composio](https://composio.dev/#houston_composio_signin=1)`. \
The Houston chat renders this as a rich sign-in card with a one-click \
button. Then add ONE short line, e.g. \"I need you to sign into Composio \
first so I can use your apps.\" Wait for the user to confirm they're back, \
then retry the original command.\n\n\
## When an app is not connected\n\n\
If `composio execute` fails because no account is linked for that \
toolkit, DO NOT open the browser for the user and DO NOT tell them \
to go to the Integrations tab. Instead:\n\n\
1. Offer to help connect the app right now and briefly say why, \
   e.g. \"I'd need Gmail connected so I can send this. Want me to help?\"\n\
2. If the user says yes, run `composio link <toolkit> --no-wait` via \
   Bash and parse the JSON output.\n\
3. Present the `redirect_url` from that JSON as a markdown link. \
   **IMPORTANT**: append `#houston_toolkit=<toolkit>` to the URL so \
   the Houston chat can render it as a rich connect card with live \
   connection status instead of a plain button. Example: if the \
   JSON has `\"toolkit\": \"gmail\"` and \
   `\"redirect_url\": \"https://connect.composio.dev/link/lk_abc\"`, \
   output exactly: \
   `[Connect Gmail](https://connect.composio.dev/link/lk_abc#houston_toolkit=gmail)`. \
   The card renders the app name/logo and handles the click for you.\n\
4. Do NOT ask the user to tell you when they're done, and do NOT promise \
   to \"check\" or \"confirm\" the connection yourself. Houston detects the \
   moment the connection goes live and automatically sends you a short \
   message (e.g. \"I've connected Gmail. Please continue.\") so you can \
   resume the task on your own. Phrase your message to set that \
   expectation instead of asking them to report back, e.g. \"Once you \
   approve access in the browser, I'll keep going from here \
   automatically.\" Then stop and wait. When Houston's confirmation \
   arrives, retry the original request.";
