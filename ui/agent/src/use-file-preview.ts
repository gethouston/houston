import { useEffect, useRef, useState } from "react";
import type { FileEntry, LoadFilePreview } from "./types";

export type PreviewState =
  | { kind: "pending" }
  | { kind: "none" }
  | { kind: "image"; url: string }
  | { kind: "text"; text: string };

export function useVisibleOnce(): [
  React.RefObject<HTMLDivElement | null>,
  boolean,
] {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible]);
  return [ref, visible];
}

export function useFilePreview(
  file: FileEntry,
  loadPreview: LoadFilePreview | undefined,
  visible: boolean,
): PreviewState {
  const [state, setState] = useState<PreviewState>({ kind: "pending" });

  const fileKey = `${file.path} ${file.dateModified ?? 0}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on fileKey (path + mtime) instead of the `file` object identity by design
  useEffect(() => {
    if (!visible) return;
    if (!loadPreview) {
      setState({ kind: "none" });
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ kind: "pending" });
    loadPreview(file)
      .then((data) => {
        if (cancelled || !data) {
          if (!cancelled) setState({ kind: "none" });
          return;
        }
        if (data.kind === "image") {
          objectUrl = URL.createObjectURL(data.blob);
          setState({ kind: "image", url: objectUrl });
        } else {
          setState({ kind: "text", text: data.text });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "none" });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [visible, loadPreview, fileKey]);

  return state;
}
