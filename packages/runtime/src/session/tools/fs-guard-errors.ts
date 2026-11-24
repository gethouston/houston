export class PathEscapeError extends Error {
  constructor(raw: string, root: string) {
    super(
      `Path is outside the agent workspace: ${raw} (file tools can only touch files under ${root})`,
    );
    this.name = "PathEscapeError";
  }
}

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

export class SharedSkillReadOnlyError extends ProtectedWriteDeniedError {
  constructor() {
    super(
      "Shared skills cannot be changed from this conversation. Use the skill as it is. If it needs a change, tell the person it can be edited on the Skills page, where a team's owners and admins edit shared skills.",
    );
    this.name = "SharedSkillReadOnlyError";
  }
}

export class AgentSettingsWriteDeniedError extends ProtectedWriteDeniedError {
  constructor() {
    super(
      "Your settings, such as your name and the AI model you work with, cannot be changed from this conversation. If they need a change, tell the person they can change them in your settings in the app.",
    );
    this.name = "AgentSettingsWriteDeniedError";
  }
}

export class UnsavedWriteError extends ProtectedWriteDeniedError {
  constructor(path: string) {
    super(
      `Houston manages this file itself, so a change made from this conversation would not be kept: ${path}. To keep notes or state of your own, write them to a file or folder of your own, for example .houston/state.json or .houston/state/.`,
    );
    this.name = "UnsavedWriteError";
  }
}

export class ReadOnlyFolderError extends ProtectedWriteDeniedError {
  constructor() {
    super(
      "This folder is kept exactly as it arrived: what people send you, and the full text of your earlier tool results. Nothing in it can be changed or replaced. Read it as it is, and save anything worth keeping to your memory instead.",
    );
    this.name = "ReadOnlyFolderError";
  }
}
