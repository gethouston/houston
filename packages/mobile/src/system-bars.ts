import { SystemBars, SystemBarsStyle } from "@capacitor/core";

export function systemBarStyleForTheme(dark: boolean): SystemBarsStyle {
  return dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light;
}

export function installSystemBars(report: (error: unknown) => void): void {
  const sync = () => {
    const style = systemBarStyleForTheme(
      document.documentElement.hasAttribute("data-theme"),
    );
    void SystemBars.setStyle({ style }).catch(report);
  };
  new MutationObserver(sync).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  sync();
}
