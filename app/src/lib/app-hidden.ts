export interface AppHiddenSource {
  on(type: "pagehide" | "visibilitychange", handler: () => void): void;
  off(type: "pagehide" | "visibilitychange", handler: () => void): void;
  isHidden(): boolean;
}

export function browserHiddenSource(): AppHiddenSource {
  return {
    on: (type, handler) =>
      type === "pagehide"
        ? window.addEventListener(type, handler)
        : document.addEventListener(type, handler),
    off: (type, handler) =>
      type === "pagehide"
        ? window.removeEventListener(type, handler)
        : document.removeEventListener(type, handler),
    isHidden: () => document.visibilityState === "hidden",
  };
}

export function onAppHidden(
  onHidden: () => void,
  source: AppHiddenSource = browserHiddenSource(),
): () => void {
  const onPageHide = () => onHidden();
  const onVisibility = () => {
    if (source.isHidden()) onHidden();
  };
  source.on("pagehide", onPageHide);
  source.on("visibilitychange", onVisibility);
  return () => {
    source.off("pagehide", onPageHide);
    source.off("visibilitychange", onVisibility);
  };
}
