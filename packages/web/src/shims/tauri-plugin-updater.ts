export type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished"; data: Record<string, never> };

export interface Update {
  rid: number;
  currentVersion: string;
  version: string;
  body?: string;
  download(onEvent?: (event: DownloadEvent) => void): Promise<void>;
  install(): Promise<void>;
  downloadAndInstall(onEvent?: (event: DownloadEvent) => void): Promise<void>;
  close(): Promise<void>;
}

export async function check(): Promise<Update | null> {
  return null;
}
