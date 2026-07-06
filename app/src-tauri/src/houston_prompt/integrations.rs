/// Integrations guidance for the TS engine (pi runtime), where the agent has
/// the in-process `integration_search` / `integration_execute` tools and NO
/// provider CLI. The connect hand-off is the `request_connection` tool, which
/// shows the user a connect card in place of the chat box. Keep in sync with
/// the `INTEGRATIONS` section of packages/host/src/houston-prompt.ts.
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
2. Call the `request_connection` tool for that app, with a short \
   user-facing reason. Houston shows the user a connect card with a \
   one-click button in place of the chat box, so there is nothing for you \
   to write out. Call it once per app that needs connecting, then end your \
   turn.\n\
3. Do NOT ask the user to tell you when they're done, and do NOT promise \
   to \"check\" the connection yourself. Houston detects the moment the \
   connection goes live and automatically sends you a short message \
   (e.g. \"I've connected Gmail. Please continue.\") so you can resume the \
   task on your own. Then stop and wait.\n\n\
Never spell out a connection link in your reply and never read any internal \
identifier out loud to the user, and never name the integrations provider. \
The card speaks for itself.";
