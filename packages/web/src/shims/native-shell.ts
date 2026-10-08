/** Registered only by the Capacitor entry, before the shared app graph loads. */
export interface NativeShell {
  openUrl(url: string): Promise<boolean>;
  identity: {
    providers: Readonly<Record<"google" | "apple" | "azure", boolean>>;
  };
  push: {
    available: boolean;
    permissionState(): Promise<"granted" | "denied" | "default">;
    requestPermission(): Promise<"granted" | "denied" | "default">;
    getToken(): Promise<string>;
    deleteToken(): Promise<void>;
    onTokenRefresh(
      listener: (token: string) => void,
    ): Promise<() => Promise<void>>;
    onNotificationTap(
      listener: (data: unknown) => void,
    ): Promise<() => Promise<void>>;
  };
}

let shell: NativeShell | null = null;

export function setNativeShell(next: NativeShell | null): void {
  shell = next;
}

export function nativeShell(): NativeShell | null {
  return shell;
}
