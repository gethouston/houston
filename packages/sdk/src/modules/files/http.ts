/**
 * The workspace-file REST calls — listing, reading, and rearranging what lives
 * in an agent's real workspace — over the injected `fetch`.
 *
 * The runtime client (`@houston/runtime-client`) is scoped to one conversation
 * and serves none of the `/agents/:id/files*` family, so this module talks to
 * those host routes through {@link httpRequest} with literal paths, which is
 * also what keeps them visible to the assistant's operation catalog.
 *
 * Nothing is swallowed here: a non-2xx always throws a {@link FilesHttpError}
 * carrying the HTTP `status`, so a deployment with no workspace to serve (the
 * synthetic local web build) reaches the caller and it — not this layer —
 * decides whether that is an empty Files section or a failure. A `401`
 * additionally fires {@link HttpScope.onUnauthorized}, so a lapsed session token
 * becomes a visible `tokenExpired` signal.
 *
 * The two BINARY reads (a file's bytes, the workspace zip) stay with the
 * surface that renders them: both answer a `Blob`, which no JSON bridge can
 * carry, so there is nothing for this module to hold.
 */

import { base64ToBytes } from "../../bridge/base64";
import { type HttpScope, httpRequest } from "../http";
import type { ProjectFile } from "./types";

/** A failed `/agents/:id/files*` request. `status` is the upstream HTTP status. */
export class FilesHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FilesHttpError";
  }
}

/**
 * A base64 payload as the latin1 string `atob` answers, chunked so a large file
 * never blows the call stack. Written over the bridge's own codec because
 * `atob` is a WebKit global an embedded JavaScriptCore/Hermes runtime does not
 * ship, and this module runs there too.
 */
function decodeBase64(content: string): string {
  const bytes = base64ToBytes(content);
  const CHUNK = 0x8000;
  let text = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    text += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return text;
}

/**
 * Lists the files in an agent's workspace.
 * @assistant group:files
 */
export async function listProjectFiles(
  scope: HttpScope,
  agentPath: string,
): Promise<ProjectFile[]> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentPath)}/files`,
  );
  return (await res.json()) as ProjectFile[];
}

/**
 * Reads a file from an agent's workspace.
 * @assistant group:files
 */
export async function readProjectFile(
  scope: HttpScope,
  agentPath: string,
  relPath: string,
): Promise<string> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentPath)}/files/read?path=${encodeURIComponent(relPath)}`,
  );
  // The host frames anything it cannot serve as text (an image, a PDF) as
  // base64 and says so, so what a caller gets back is always the file's real
  // contents rather than a mojibake transcription of its bytes.
  const body = (await res.json()) as { content: string; base64: boolean };
  return body.base64 ? decodeBase64(body.content) : body.content;
}

/**
 * Permanently deletes a file from an agent's workspace.
 * @assistant group:files confirm
 */
export async function deleteFile(
  scope: HttpScope,
  agentPath: string,
  relPath: string,
): Promise<void> {
  await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentPath)}/files?path=${encodeURIComponent(relPath)}`,
    { method: "DELETE" },
  );
}

/**
 * Renames a file in an agent's workspace.
 * @assistant group:files confirm
 */
export async function renameFile(
  scope: HttpScope,
  agentPath: string,
  relPath: string,
  newName: string,
): Promise<void> {
  await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentPath)}/files/rename`,
    { method: "POST", body: JSON.stringify({ path: relPath, newName }) },
  );
}

/**
 * Creates a folder in an agent's workspace.
 * @assistant group:files unconfirmed: Creates an empty folder without replacing existing content.
 */
export async function createFolder(
  scope: HttpScope,
  agentPath: string,
  folderName: string,
): Promise<{ created: string }> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentPath)}/files/folder`,
    { method: "POST", body: JSON.stringify({ path: folderName }) },
  );
  return (await res.json()) as { created: string };
}

/**
 * Moves a file into another folder of an agent's workspace.
 *
 * Move a file/folder into another folder (null = workspace root).
 * @assistant group:files confirm
 */
export async function moveProjectFile(
  scope: HttpScope,
  agentPath: string,
  relPath: string,
  toDir: string | null,
): Promise<void> {
  await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentPath)}/files/move`,
    { method: "POST", body: JSON.stringify({ path: relPath, toDir }) },
  );
}
