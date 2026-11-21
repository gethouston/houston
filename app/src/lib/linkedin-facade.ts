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
