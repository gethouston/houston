import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "<!-- Houston Google sign-in URL scheme -->";

function reversedClientId(plist: string): string {
  const value =
    /<key>REVERSED_CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/.exec(
      plist,
    )?.[1];
  if (!value || !/^[A-Za-z0-9._-]+$/.test(value))
    throw new Error("GoogleService-Info.plist has no valid REVERSED_CLIENT_ID");
  return value;
}

export function withGoogleUrlScheme(
  info: string,
  firebasePlist: string,
): string {
  const scheme = reversedClientId(firebasePlist);
  const block = `${MARKER}\n\t<key>CFBundleURLTypes</key>\n\t<array>\n\t\t<dict>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array><string>${scheme}</string></array>\n\t\t</dict>\n\t</array>`;
  if (info.includes(MARKER)) {
    const start = info.indexOf(MARKER);
    const end = info.indexOf("\n\t</array>", start);
    if (end < 0)
      throw new Error("Houston Google URL scheme block is malformed");
    return `${info.slice(0, start)}${block}${info.slice(end + "\n\t</array>".length)}`;
  }
  if (info.includes("<key>CFBundleURLTypes</key>"))
    throw new Error(
      "Info.plist already has URL types; add the Google scheme there before sync",
    );
  const close = info.lastIndexOf("</dict>");
  if (close < 0) throw new Error("Info.plist has no root dictionary");
  return `${info.slice(0, close)}${block}\n${info.slice(close)}`;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const mobileRoot = path.resolve(path.dirname(scriptPath), "..");
  const firebasePath = path.join(
    mobileRoot,
    "ios/App/App/GoogleService-Info.plist",
  );
  if (existsSync(firebasePath)) {
    const infoPath = path.join(mobileRoot, "ios/App/App/Info.plist");
    const before = readFileSync(infoPath, "utf8");
    const after = withGoogleUrlScheme(
      before,
      readFileSync(firebasePath, "utf8"),
    );
    if (after !== before) writeFileSync(infoPath, after);
  }
}
