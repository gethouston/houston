import type { IncomingMessage, ServerResponse } from "node:http";
import type { UserId } from "./domain/types";

export type MountAdmin = (
  userId: UserId,
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<boolean>;
