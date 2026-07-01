/**
 * Hand a Blob to the browser as a named download. Web-build only — the
 * desktop app opens files with the OS instead (tauriFiles.open/reveal).
 */
export function saveBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke once the download has had time to start.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
