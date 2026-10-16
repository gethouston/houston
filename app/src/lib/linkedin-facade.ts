import type {
  LinkedInCompletion,
  LinkedInConnectAnswer,
  LinkedInConnection,
  LinkedInConnectReturn,
  LinkedInPostInput,
  LinkedInPostResult,
} from "@houston/engine-adapter";
import { isLinkedInUnavailableError } from "@houston/sdk/linkedin/policy";
import { getEngine } from "./engine";
import { engineCall } from "./tauri";

/**
 * Posting the org chart to the person's own LinkedIn. A deployment with no
 * LinkedIn (no key, a host that does not serve the routes) is expected and
 * silenced here: the share dialog falls back to copy and paste. A post's
 * refusals arrive typed and the dialog decides on them; only a failure that
 * is not a refusal takes the default path.
 */
const options = { silence: isLinkedInUnavailableError };

export const tauriLinkedIn = {
  connection: (signal?: AbortSignal) =>
    engineCall<LinkedInConnection>(
      "linkedin_connection",
      () => getEngine().linkedInConnection(signal),
      undefined,
      options,
    ),
  connect: (returnTo: LinkedInConnectReturn | undefined) =>
    engineCall<LinkedInConnectAnswer>(
      "linkedin_connect",
      () => getEngine().connectLinkedIn(returnTo),
      undefined,
      options,
    ),
  /** A refused ticket answers `invalid`, typed; only a failure throws. */
  complete: (ticket: string) =>
    engineCall<LinkedInCompletion>(
      "linkedin_complete",
      () => getEngine().completeLinkedIn(ticket),
      undefined,
      options,
    ),
  disconnect: () =>
    engineCall<void>("linkedin_disconnect", () =>
      getEngine().disconnectLinkedIn(),
    ),
  postImage: (input: LinkedInPostInput) =>
    engineCall<LinkedInPostResult>("linkedin_post", () =>
      getEngine().postLinkedInImage(input),
    ),
};
