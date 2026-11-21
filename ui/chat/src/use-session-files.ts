import { useCallback, useEffect, useRef, useState } from "react";

export interface SessionFiles {
  files: File[];
  setFiles: (files: File[]) => void;
  releaseFiles: (sent: readonly File[]) => void;
  ingestInto: (
    sessionKey: string,
    ingest: (files: File[], setFiles: (next: File[]) => void) => void,
  ) => void;
}

export function useSessionFiles(
  sessionKey: string,
  attachments: File[] | undefined,
  onAttachmentsChange: ((files: File[]) => void) | undefined,
): SessionFiles {
  const [byKey, setByKey] = useState<Record<string, File[]>>({});
  const controlled = attachments !== undefined;

  const files = controlled ? attachments : (byKey[sessionKey] ?? NONE);
  const setFiles = useCallback(
    (next: File[]) => {
      if (controlled) onAttachmentsChange?.(next);
      else setByKey((prev) => withList(prev, sessionKey, next));
    },
    [controlled, onAttachmentsChange, sessionKey],
  );
  const releaseFiles = useCallback(
    (sent: readonly File[]) => {
      if (controlled || sent.length === 0) return;
      const keep = (f: File) => !sent.includes(f);
      setByKey((prev) => {
        let next = prev;
        for (const [key, list] of Object.entries(prev)) {
          if (list.every(keep)) continue;
          next = withList(next, key, list.filter(keep));
        }
        return next;
      });
    },
    [controlled],
  );
  const latest = useRef({ byKey, attachments, onAttachmentsChange });
  useEffect(() => {
    latest.current = { byKey, attachments, onAttachmentsChange };
  });
  const ingestInto = useCallback<SessionFiles["ingestInto"]>((key, ingest) => {
    const now = latest.current;
    if (now.attachments !== undefined) {
      ingest(now.attachments, (next) => now.onAttachmentsChange?.(next));
      return;
    }
    ingest(now.byKey[key] ?? NONE, (next) =>
      setByKey((prev) => withList(prev, key, next)),
    );
  }, []);
  return { files, setFiles, releaseFiles, ingestInto };
}

const NONE: File[] = [];

function withList(
  prev: Record<string, File[]>,
  key: string,
  list: File[],
): Record<string, File[]> {
  const next = { ...prev };
  if (list.length === 0) delete next[key];
  else next[key] = list;
  return next;
}
