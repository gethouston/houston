import type { ProductAnalyticsContext } from "./wire.ts";

export interface ProductAnalyticsContextDeps {
  sessionId(): string;
  appVersion: string;
  platform(): "desktop" | "web";
  readInstallId(): Promise<string>;
  readVisitorId(): string | null;
}

export interface InstallIdReaderDeps {
  whenEngineReady(): Promise<void>;
  readStoredId(): Promise<string>;
}

export function createInstallIdReader(
  deps: InstallIdReaderDeps,
): () => Promise<string> {
  return async () => {
    await deps.whenEngineReady();
    return deps.readStoredId();
  };
}

export function createProductAnalyticsContext(
  deps: ProductAnalyticsContextDeps,
): () => ProductAnalyticsContext {
  let installId: string | undefined;
  let reading = false;

  function startReading(): void {
    if (reading || installId !== undefined) return;
    reading = true;
    void deps.readInstallId().then((id) => {
      installId = id;
    });
  }

  return () => {
    startReading();
    const visitorId = deps.readVisitorId();
    return {
      session_id: deps.sessionId(),
      app_version: deps.appVersion,
      platform: deps.platform(),
      ...(installId === undefined ? {} : { install_id: installId }),
      ...(visitorId === null ? {} : { visitor_id: visitorId }),
    };
  };
}
