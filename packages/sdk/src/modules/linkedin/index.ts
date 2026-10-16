/**
 * The linkedin module: posting a picture to the person's own LinkedIn feed.
 * Whether their LinkedIn is connected, connecting it (LinkedIn's own page in
 * their browser, then redeeming the ticket it sends back), disconnecting it,
 * and the post itself.
 *
 * Pure commands over hosted-gateway routes, user-scoped: the connection
 * belongs to the person, not a space or an agent, so the module runs on its
 * own {@link moduleScope} rooted at the base URL. A 401 routes through the
 * shared {@link ModuleContext.authExpiry} notifier. The surface rules (the
 * connect watch, what each refusal means) live in `./policy`, the connect's
 * sequencing in `./connect-flow`.
 */

import type { ModuleContext } from "../../module-context";
import { parseSlackConnectReturn } from "../channels/connect-return";
import { requireTicket } from "../channels/types";
import { moduleScope, SdkHttpError } from "../http";
import { field, requireString } from "../payload";
import {
  completeLinkedIn,
  connectLinkedIn,
  disconnectLinkedIn,
  getLinkedInConnection,
  postLinkedInImage,
} from "./http";
import {
  LinkedInCommand,
  type LinkedInCompletion,
  type LinkedInConnectAnswer,
  type LinkedInConnection,
  type LinkedInConnectReturn,
  type LinkedInPostInput,
  type LinkedInPostResult,
} from "./types";
import { linkedInUpload } from "./upload";

export type {
  LinkedInCommandType,
  LinkedInCompletion,
  LinkedInConnectAnswer,
  LinkedInConnection,
  LinkedInConnectReturn,
  LinkedInPostInput,
  LinkedInPostResult,
  LinkedInRefusalCode,
} from "./types";
export { LinkedInCommand } from "./types";
export {
  checkLinkedInText,
  isPostableLinkedInText,
  type LinkedInTextCheck,
} from "./upload";

/** The typed facade for the linkedin family. */
export interface LinkedInModule {
  /** Whether the person's LinkedIn is connected, and as whom. */
  connection(signal?: AbortSignal): Promise<LinkedInConnection>;
  /**
   * LinkedIn's authorization page, for the person's browser to open, and the
   * return it leads back to (`returnTo`; omitted, the web app).
   */
  connect(
    returnTo?: LinkedInConnectReturn,
    signal?: AbortSignal,
  ): Promise<LinkedInConnectAnswer>;
  /** Redeem the one-time ticket the callback returned with. */
  complete(ticket: string, signal?: AbortSignal): Promise<LinkedInCompletion>;
  /** Forget the person's LinkedIn token. */
  disconnect(signal?: AbortSignal): Promise<void>;
  /**
   * Post the picture with its words. Refusals are typed, including the ones
   * earned before any request (words or a picture the gateway would refuse).
   * No answer within three minutes, a connection cut after the request left,
   * or a bare 502 or 504 is `unknown`: the post may be up. Once the 2xx
   * headers arrive it is posted, whatever its body does. An abort through
   * `input.signal` before any answer rejects with its reason.
   */
  postImage(input: LinkedInPostInput): Promise<LinkedInPostResult>;
}

/** A failed linkedin request. `status` is the upstream HTTP status. */
export class LinkedInHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "LinkedInHttpError");
  }
}

function requireBlob(payload: unknown, key: string): Blob {
  const value = field(payload, key);
  if (!(value instanceof Blob)) throw new Error(`'${key}' must be a picture`);
  return value;
}

function optionalString(payload: unknown, key: string): string | undefined {
  const value = field(payload, key);
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`'${key}' must be text`);
  return value;
}

export function createLinkedInModule(ctx: ModuleContext): LinkedInModule {
  const scope = moduleScope(ctx, "linkedin", LinkedInHttpError);

  const module: LinkedInModule = {
    connection: (signal) => getLinkedInConnection(scope, signal),
    connect: (returnTo, signal) => connectLinkedIn(scope, returnTo, signal),
    complete: (ticket, signal) => completeLinkedIn(scope, ticket, signal),
    disconnect: (signal) => disconnectLinkedIn(scope, signal),
    postImage: async (input) => {
      const upload = linkedInUpload(input);
      if (!(upload instanceof FormData)) return upload;
      return postLinkedInImage(scope, upload, input.signal);
    },
  };

  ctx.registerCommand(LinkedInCommand.Connection, () => module.connection());
  ctx.registerCommand(LinkedInCommand.Connect, (p) =>
    module.connect(parseSlackConnectReturn(field(p, "returnTo"))),
  );
  ctx.registerCommand(LinkedInCommand.Complete, (p) =>
    module.complete(requireTicket(p, "ticket")),
  );
  ctx.registerCommand(LinkedInCommand.Disconnect, () => module.disconnect());
  ctx.registerCommand(LinkedInCommand.PostImage, (p) =>
    module.postImage({
      image: requireBlob(p, "image"),
      text: requireString(p, "text"),
      altText: optionalString(p, "altText"),
    }),
  );

  return module;
}
