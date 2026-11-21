const SYSTEM_SCHEMES = new Set(["mailto:", "tel:", "sms:"]);

export type OpenUrlPorts = {
  browser(url: string): Promise<void>;
  system(url: string): void;
};

export async function openExternalUrl(
  raw: string,
  base: string,
  ports: OpenUrlPorts,
): Promise<boolean> {
  const url = new URL(raw, base);
  if (url.protocol === "https:" || url.protocol === "http:") {
    await ports.browser(url.href);
    return true;
  }
  if (SYSTEM_SCHEMES.has(url.protocol)) {
    ports.system(url.href);
    return true;
  }
  throw new Error(`Refusing to open unsupported URL scheme ${url.protocol}`);
}
