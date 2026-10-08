/** Registered only by the Capacitor entry, before the shared app graph loads. */
export interface NativeShell {
  openUrl(url: string): Promise<boolean>;
}

let shell: NativeShell | null = null;

export function setNativeShell(next: NativeShell | null): void {
  shell = next;
}

export function nativeShell(): NativeShell | null {
  return shell;
}
