type FullscreenWindow = {
  isFullscreen(): Promise<boolean>;
  onResized(handler: () => void): Promise<() => void>;
};

/** Resize reads may settle out of order; only the latest live read applies. */
export function watchFullscreen(
  win: FullscreenWindow,
  onChange: (fullscreen: boolean) => void,
  report: (code: string, err: unknown) => void,
): () => void {
  let disposed = false;
  let revision = 0;
  let unlisten: (() => void) | undefined;

  const refresh = async () => {
    const current = ++revision;
    try {
      const value = await win.isFullscreen();
      if (!disposed && current === revision) onChange(value);
    } catch (err) {
      report("window_controls_fullscreen", err);
    }
  };

  void win
    .onResized(() => {
      void refresh();
    })
    .then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    })
    .catch((err: unknown) => {
      report("window_controls_resize", err);
    });
  void refresh();

  return () => {
    disposed = true;
    unlisten?.();
  };
}
