// Integration-action slug → human label. Pure and DOM-free so the node:test
// suite can import it; both the process-block header (present tense) and the
// turn-end "Updates made" summary (past tense, PRODUCT-1196) resolve their
// labels here, from one verb table family.

// Present-progressive forms for the common Composio action verbs. English only,
// by the same rule as `tool-labels.ts`: `ui/` stays i18n-agnostic and the app
// does not localize tool verbs, so an integration action reads in English in
// every locale (matching the in-pane tool rows). An unmapped verb is capitalized
// as-is, never conjugated — a wrong gerund reads worse than the plain word.
const ACTION_GERUNDS: Record<string, string> = {
  send: "Sending",
  create: "Creating",
  get: "Getting",
  fetch: "Fetching",
  list: "Listing",
  search: "Searching",
  find: "Finding",
  update: "Updating",
  delete: "Deleting",
  move: "Moving",
  reply: "Replying",
  post: "Posting",
  add: "Adding",
  remove: "Removing",
};

// Past-tense forms for the same verbs (plus the mutation verbs the turn-end
// "Updates made" summary lists, PRODUCT-1196), so a completed action reads as
// a fact ("Sent email"), not a step in progress.
const ACTION_DONE: Record<string, string> = {
  send: "Sent",
  create: "Created",
  get: "Got",
  fetch: "Fetched",
  list: "Listed",
  search: "Searched",
  find: "Found",
  update: "Updated",
  delete: "Deleted",
  move: "Moved",
  reply: "Replied",
  post: "Posted",
  add: "Added",
  remove: "Removed",
  upload: "Uploaded",
  insert: "Inserted",
  append: "Appended",
  edit: "Edited",
  archive: "Archived",
  forward: "Forwarded",
  publish: "Published",
  schedule: "Scheduled",
  share: "Shared",
  invite: "Invited",
  copy: "Copied",
  submit: "Submitted",
  write: "Wrote",
  star: "Starred",
  cancel: "Canceled",
  rename: "Renamed",
  assign: "Assigned",
  complete: "Completed",
  set: "Set",
};

/** Capitalize the first letter, lowercase the rest ("SEND" -> "Send"). */
function capitalizeWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** The action slug's words with the toolkit prefix stripped (case-insensitive,
 *  incl. multi-word toolkits like `google_maps`); empty when the slug is
 *  nothing but the prefix. */
function actionWords(action: string, toolkit: string): string[] {
  const prefix = `${toolkit.toLowerCase()}_`;
  const rest =
    toolkit.length > 0 && action.toLowerCase().startsWith(prefix)
      ? action.slice(prefix.length)
      : action;
  return rest.split("_").filter((w) => w.length > 0);
}

function humanizeAction(
  action: string,
  toolkit: string,
  verbs: Record<string, string>,
): string {
  const words = actionWords(action, toolkit);
  if (words.length === 0) {
    // The action is nothing but the toolkit prefix ("GMAIL_"): no verb to
    // conjugate, so fall back to the capitalized whole slug.
    const whole = action.split("_").filter((w) => w.length > 0);
    return whole.map(capitalizeWord).join(" ");
  }
  const [verb, ...tail] = words;
  const head = verbs[verb.toLowerCase()] ?? capitalizeWord(verb);
  return [head, ...tail.map((w) => w.toLowerCase())].join(" ");
}

/** A present-tense human label for a Composio action slug, for the process-block
 *  header's branded row ("GMAIL_SEND_EMAIL" + toolkit "gmail" -> "Sending
 *  email"). Strips the toolkit prefix, turns the leading verb into its gerund,
 *  and lowercases the rest. An unmapped verb (or a slug that is all prefix)
 *  falls back to the capitalized de-underscored remainder without conjugation
 *  ("GMAIL_SYNC_CONTACTS" -> "Sync contacts"). Pure, node-tested. */
export function humanizeActionGerund(action: string, toolkit: string): string {
  return humanizeAction(action, toolkit, ACTION_GERUNDS);
}

/** The past-tense counterpart of {@link humanizeActionGerund}
 *  ("GMAIL_SEND_EMAIL" + "gmail" -> "Sent email"), for surfaces that report a
 *  completed action — the turn-end "Updates made" rows (PRODUCT-1196). */
export function humanizeActionDone(action: string, toolkit: string): string {
  return humanizeAction(action, toolkit, ACTION_DONE);
}
