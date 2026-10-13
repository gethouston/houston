/**
 * The refusals a workspace path guard can produce. They are separate
 * types because callers distinguish them: an escape is a path that never
 * belonged here, a not-allowed is a path this role has no business with, and a
 * denial is a path inside an allowed root that holds credential material.
 * Every message reaches the model verbatim in a tool result, so each stays
 * plain-language and echoes nothing but the path the model itself supplied.
 */

export class PathEscapeError extends Error {
  constructor(raw: string, root: string) {
    super(
      `Path is outside the agent workspace: ${raw} (file tools can only touch files under ${root})`,
    );
    this.name = "PathEscapeError";
  }
}

/**
 * A path outside the exact set of documents this runtime may touch. Distinct
 * from an escape: the path may sit inside the workspace and still be none of
 * this role's business. The message reaches the model verbatim, so it says what
 * IS allowed rather than only what is not.
 */
export class PathNotAllowedError extends Error {
  constructor(raw: string, allowed: string[], readable: string[] = []) {
    const attachments = readable.length
      ? ` You can also read what people send you, kept in ${readable.join(", ")}, but not change it.`
      : "";
    super(
      `You cannot open or change that: ${raw}. The only ${allowed.length === 1 ? "document" : "documents"} you can read or write here: ${allowed.join(", ")}.${attachments}`,
    );
    this.name = "PathNotAllowedError";
  }
}

/**
 * A path inside an allowed root that holds sign-in credentials. The message is
 * shown verbatim in a tool result, so it stays plain-language and never echoes
 * anything but the path the model itself supplied.
 */
export class PathDeniedError extends Error {
  constructor(raw: string) {
    super(
      `This file holds the sign-in credentials for the connected accounts, so it cannot be read or changed: ${raw}. Those accounts are already connected for you, and nothing in that file is needed to do the work.`,
    );
    this.name = "PathDeniedError";
  }
}

export class ProtectedWriteDeniedError extends Error {}

export class BoardWriteDeniedError extends ProtectedWriteDeniedError {
  constructor() {
    super(
      "Your board is changed with the mission tools, not by editing files.",
    );
    this.name = "BoardWriteDeniedError";
  }
}

export class RoutineWriteDeniedError extends ProtectedWriteDeniedError {
  constructor() {
    super("Routines are changed with the routine tools, not by editing files.");
    this.name = "RoutineWriteDeniedError";
  }
}

/**
 * A write into a READ-ONLY root: the org-shared skills a pooled turn reads
 * from a throwaway snapshot. An edit there would vanish with the turn, so the
 * model is told the skill is used as it is.
 */
export class SharedSkillReadOnlyError extends ProtectedWriteDeniedError {
  constructor() {
    super(
      "Shared skills belong to the whole team and cannot be changed from this conversation. Use the skill as it is.",
    );
    this.name = "SharedSkillReadOnlyError";
  }
}

/**
 * A write into a folder the runtime may only read: the attachments people send
 * the coordinator. They are the person's own material, kept as it arrived, and
 * a prompt injection riding one attachment must not be able to rewrite the
 * next, so the model is told to use them as they are.
 */
export class AttachmentReadOnlyError extends ProtectedWriteDeniedError {
  constructor() {
    super(
      "What people send you is kept exactly as it arrived and cannot be changed or replaced. Read it as it is, and save anything worth keeping to your memory instead.",
    );
    this.name = "AttachmentReadOnlyError";
  }
}

/** The coordinator's memory changes only through `save_learning`. */
export class MemoryWriteDeniedError extends ProtectedWriteDeniedError {
  constructor() {
    super(
      "Your memory cannot be edited directly. Save or merge memories with save_learning, passing the ids of the memories a new one replaces in `replaces`.",
    );
    this.name = "MemoryWriteDeniedError";
  }
}
