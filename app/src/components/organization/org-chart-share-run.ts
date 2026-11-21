import {
  isShareBusy,
  isShareCancel,
  type ShareChannel,
} from "./org-chart-share-model.ts";

export interface ShareSheet {
  canShare: (data: { files: File[] }) => boolean;
  share: (data: { files: File[]; text: string }) => Promise<void>;
}

export type ShareRoute =
  | { kind: "sheet"; sheet: ShareSheet }
  | { kind: "post" }
  | { kind: "paste" };

export function shareRoute(env: {
  tauri: boolean;
  nativeMobile: boolean;
  coarse: boolean;
  sheet: ShareSheet | undefined;
  image: File | null;
  linkedin: boolean;
}): ShareRoute {
  const { sheet, image } = env;
  if (
    !env.tauri &&
    env.coarse &&
    sheet &&
    (!image || sheet.canShare({ files: [image] }))
  )
    return { kind: "sheet", sheet };
  return env.linkedin && !env.nativeMobile
    ? { kind: "post" }
    : { kind: "paste" };
}

export type ShareLine =
  | { kind: "copied" }
  | { kind: "saved" }
  | {
      kind: "blocked";
      url: string;
      channel: ShareChannel | null;
      image?: "copied" | "saved";
    }
  | { kind: "reconnect" }
  | { kind: "wait"; retryAfterMs?: number }
  | { kind: "retry" }
  | { kind: "posted"; opened: boolean }
  | { kind: "unconfirmed" };

export interface ShareLanding {
  channel: ShareChannel | null;
  line: ShareLine | null;
}

export const NO_LANDING: ShareLanding = { channel: null, line: null };

export function shareViaSheet(
  sheet: ShareSheet,
  image: File,
  text: string,
  report: (command: string, error: unknown) => void,
): Promise<ShareLanding> {
  return sheet.share({ files: [image], text }).then(
    () => ({ channel: "native", line: null }),
    (error: unknown) => {
      if (!isShareCancel(error) && !isShareBusy(error))
        report("org_chart_share_native", error);
      return NO_LANDING;
    },
  );
}
