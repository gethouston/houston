import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { executeMigrateOp } from "./op-migrate";
import type { OpClaimTurn } from "./op-republish";
import { executeSeedOp } from "./op-seed";
import type { OpRequest } from "./parse-op-request";
import type { TurnServerDeps } from "./server-types";

export interface OwnTreeReply {
  status: number;
  body: unknown;
}

export function executeOwnTreeOp(input: {
  deps: TurnServerDeps;
  op: OpRequest;
  turn: OpClaimTurn;
  store: ObjectStore;
  prefix: string;
  root: string;
  fenced: () => Promise<boolean>;
}): Promise<OwnTreeReply> | null {
  const { op } = input;
  if (op.op.kind === "seed")
    return executeSeedOp({ ...input, op: { ...op, op: op.op } });
  if (op.op.kind === "migrate")
    return executeMigrateOp({ ...input, op: { ...op, op: op.op } });
  return null;
}
