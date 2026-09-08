/**
 * The three refusals a workspace path guard can produce. They are separate
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
  constructor(raw: string, allowed: string[]) {
    super(
      `You cannot open or change that: ${raw}. The only ${allowed.length === 1 ? "document" : "documents"} you can read or write here: ${allowed.join(", ")}.`,
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
