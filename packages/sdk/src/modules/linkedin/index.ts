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

export interface LinkedInModule {
  connection(signal?: AbortSignal): Promise<LinkedInConnection>;
  connect(
    returnTo?: LinkedInConnectReturn,
    signal?: AbortSignal,
  ): Promise<LinkedInConnectAnswer>;
  complete(ticket: string, signal?: AbortSignal): Promise<LinkedInCompletion>;
  disconnect(signal?: AbortSignal): Promise<void>;
  postImage(input: LinkedInPostInput): Promise<LinkedInPostResult>;
}

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
