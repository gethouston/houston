import { isTauri } from "@tauri-apps/api/core";
import { osSaveDownload } from "./os-bridge";

export type SaveBlobResult =
  | {
      kind: "saved";
      /** Non-null only on the native path; browsers manage their own
       *  download location. */
      path: string | null;
      /** The name on disk: the requested one, or the free sibling the shell
       *  fell back to when the requested file was open in another program. */
      fileName: string;
      renamedFrom: string | null;
    }
  | { kind: "cancelled" };

/**
 * Hand a Blob to the user as a named download.
 *
 * Browser builds use the anchor-download machinery. The desktop webview
 * (WKWebView) ignores those clicks — there is no download delegate — so on
 * desktop the bytes go to the native shell instead, which shows an OS save
 * dialog and writes the file itself (HOU-703). `path` is non-null only on
 * that native path; browsers manage their own download location.
 */
export async function saveBlob(
  name: string,
  blob: Blob,
): Promise<SaveBlobResult> {
  if (isTauri()) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const written = await osSaveDownload(name, bytes);
    return written === null
      ? { kind: "cancelled" }
      : { kind: "saved", ...written };
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke once the download has had time to start.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { kind: "saved", path: null, fileName: name, renamedFrom: null };
}
