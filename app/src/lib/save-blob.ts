import { isTauri } from "@tauri-apps/api/core";
import { osSaveDownload } from "./os-bridge";

export type SaveBlobResult =
  | {
      kind: "saved";
      path: string | null;
      fileName: string;
      renamedFrom: string | null;
    }
  | { kind: "cancelled" };

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
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { kind: "saved", path: null, fileName: name, renamedFrom: null };
}
