import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import {
  adoptApprovals,
  carryApprovals,
} from "@houston/host/src/assistant/approval-carry";
import { ApprovalStore } from "@houston/host/src/assistant/approvals";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { AdmittedMessages } from "./turn-admitted-messages";
import { mutateTurnDocument } from "./turn-doc-cas";
import type { TurnFilesystem } from "./turn-filesystem";

export interface TurnApprovals {
  readonly approvals: ApprovalStore;
  save(): Promise<void>;
}

export interface TurnApprovalsInput {
  store: ObjectStore;
  prefix: string;
  filesystem: TurnFilesystem;
  agentId: string;
  conversationId: string;
}

export function approvalsDocRel(
  filesystem: Pick<TurnFilesystem, "dataRel">,
  conversationId: string,
): string {
  return posix.join(
    filesystem.dataRel,
    "sessions",
    conversationId,
    "assistant-approvals.json",
  );
}

export async function openTurnApprovals(
  input: TurnApprovalsInput,
  receive: (
    approvals: ApprovalStore,
    admitted: AdmittedMessages,
    damaged: boolean,
  ) => void,
): Promise<TurnApprovals> {
  const relativePath = approvalsDocRel(input.filesystem, input.conversationId);
  const local = join(input.filesystem.storeRoot, ...relativePath.split("/"));
  const scope = {
    agentId: input.agentId,
    conversationId: input.conversationId,
  };
  const write = async (store: ApprovalStore, admitted: AdmittedMessages) => {
    await mkdir(dirname(local), { recursive: true });
    await writeFile(
      local,
      JSON.stringify({
        ...carryApprovals(store, input.agentId, input.conversationId),
        admitted,
      }),
    );
  };
  let approvals = new ApprovalStore();
  let admitted = new AdmittedMessages(null);
  await mutateTurnDocument({
    ...input,
    relativePath,
    apply: async () => {
      const read = await readCarry(local);
      const carried = read === DAMAGED ? null : read;
      approvals = new ApprovalStore();
      adoptApprovals(approvals, carried, scope);
      admitted = new AdmittedMessages(
        typeof carried === "object" && carried !== null && "admitted" in carried
          ? carried.admitted
          : null,
      );
      receive(approvals, admitted, read === DAMAGED);
      await write(approvals, admitted);
    },
  });
  let saving: Promise<void> = Promise.resolve();
  const saveOnce = () =>
    mutateTurnDocument({
      ...input,
      relativePath,
      apply: () => write(approvals, admitted),
    });
  return {
    get approvals() {
      return approvals;
    },
    save: () => {
      const next = saving.then(saveOnce, saveOnce);
      saving = next.catch(() => undefined);
      return next;
    },
  };
}

const DAMAGED = Symbol("damaged approval record");

async function readCarry(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    console.error(
      "[turn-approvals] the approval record file is unreadable; its cards are asked again and this message mints no grant",
    );
    return DAMAGED;
  }
}
