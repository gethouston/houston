import { planUrlOpenFailure } from "../../lib/url-open-failure.ts";
import type { LinkedInPostOutcome } from "./linkedin-post-run.ts";
import type { ShareDialogAction } from "./org-chart-share-state.ts";

export interface OwnPostPorts {
  onScreen: () => number | null;
  mayOpen: () => boolean;
  open: (url: string) => Promise<boolean>;
  report: (error: unknown) => void;
  dispatch: (action: ShareDialogAction) => void;
}

export async function postAndOpen(
  run: () => Promise<LinkedInPostOutcome | null>,
  ports: OwnPostPorts,
): Promise<LinkedInPostOutcome | null> {
  const made = ports.onScreen();
  const outcome = await run();
  if (outcome?.kind !== "posted" || made === null) return outcome;
  if (ports.onScreen() !== made || !ports.mayOpen()) return outcome;
  if (await openQuietly(outcome.postUrl, ports))
    ports.dispatch({
      type: "postOpened",
      session: made,
      postUrl: outcome.postUrl,
    });
  return outcome;
}

async function openQuietly(url: string, ports: OwnPostPorts): Promise<boolean> {
  try {
    return await ports.open(url);
  } catch (error) {
    if (planUrlOpenFailure(error).surface === "report") ports.report(error);
    return false;
  }
}
