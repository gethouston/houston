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
