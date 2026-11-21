type UnlistenFn = () => void;

interface FocusEvent {
  payload: boolean;
}

interface WebWindow {
  close(): Promise<void>;
  isFocused(): Promise<boolean>;
  isFullscreen(): Promise<boolean>;
  onResized(handler: () => void): Promise<UnlistenFn>;
  onFocusChanged(handler: (event: FocusEvent) => void): Promise<UnlistenFn>;
  setTheme(theme?: "light" | "dark" | null): Promise<void>;
}

export function getCurrentWindow(): WebWindow {
  return {
    async close(): Promise<void> {
      window.close();
    },
    async isFocused(): Promise<boolean> {
      return typeof document !== "undefined" ? document.hasFocus() : true;
    },
    async isFullscreen(): Promise<boolean> {
      return document.fullscreenElement !== null;
    },
    onResized(handler: () => void): Promise<UnlistenFn> {
      window.addEventListener("resize", handler);
      return Promise.resolve(() =>
        window.removeEventListener("resize", handler),
      );
    },
    onFocusChanged(handler: (event: FocusEvent) => void): Promise<UnlistenFn> {
      const onFocus = () => handler({ payload: true });
      const onBlur = () => handler({ payload: false });
      window.addEventListener("focus", onFocus);
      window.addEventListener("blur", onBlur);
      return Promise.resolve(() => {
        window.removeEventListener("focus", onFocus);
        window.removeEventListener("blur", onBlur);
      });
    },
    async setTheme(): Promise<void> {},
  };
}
