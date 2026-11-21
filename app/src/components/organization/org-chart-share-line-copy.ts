import type { ShareLine } from "./org-chart-share-run.ts";

export const LINE_KEY = {
  copied: "orgChart.share.copied",
  saved: "orgChart.share.saved",
  reconnect: "orgChart.share.reconnect",
  wait: "orgChart.share.rateLimited",
  retry: "orgChart.share.postFailed",
  unconfirmed: "orgChart.share.unconfirmed",
} as const satisfies Record<
  Exclude<ShareLine["kind"], "blocked" | "posted">,
  string
>;

export function shareLineKey(line: Exclude<ShareLine, { kind: "blocked" }>) {
  if (line.kind !== "posted") return LINE_KEY[line.kind];
  return line.opened ? "orgChart.share.postedOpened" : "orgChart.share.posted";
}
