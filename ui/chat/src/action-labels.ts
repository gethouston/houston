import { actionWordsWithoutToolkit } from "@houston-ai/core/src/integration-action-words.ts";

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

function capitalizeWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function humanizeAction(
  action: string,
  toolkit: string,
  verbs: Record<string, string>,
): string {
  const words = actionWordsWithoutToolkit(action, toolkit);
  if (words.length === 0) {
    const whole = action.split("_").filter((w) => w.length > 0);
    return whole.map(capitalizeWord).join(" ");
  }
  const [verb, ...tail] = words;
  const head = verbs[verb.toLowerCase()] ?? capitalizeWord(verb);
  return [head, ...tail.map((w) => w.toLowerCase())].join(" ");
}

export function humanizeActionGerund(action: string, toolkit: string): string {
  return humanizeAction(action, toolkit, ACTION_GERUNDS);
}

export function humanizeActionDone(action: string, toolkit: string): string {
  return humanizeAction(action, toolkit, ACTION_DONE);
}
