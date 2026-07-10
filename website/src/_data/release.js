// Latest-release installer URLs, resolved at BUILD time (async data file,
// same pattern as changelog.js). NOTE: no named exports here — Eleventy
// treats named exports in data files as data keys and drops the default.
//
// Why this exists: the download gate used to depend entirely on a runtime
// fetch of api.github.com from the visitor's browser. Unauthenticated GitHub
// API calls are limited to 60/hour PER IP, so visitors behind shared IPs
// (offices, VPNs, mobile carrier NAT) got no installer URL and the download
// button could never enable, even with a valid invite code. These build-time
// URLs are baked into the page as the guaranteed fallback: the runtime fetch
// (when it works) upgrades them to the very latest release; when it fails,
// the baked link still downloads the app directly (at worst one release
// behind this deploy, and the app self-updates on first launch).
//
// Unlike changelog.js (cosmetic, fails soft), this fails CLOSED in CI:
// deploying a page with empty fallbacks would silently reintroduce the
// dead-button bug, so we throw and let the deploy fail visibly instead.
import { pickInstallerUrls } from "../../lib/release-assets.js";

const RELEASES_API =
  "https://api.github.com/repos/gethouston/houston/releases/latest";

async function fetchLatestAssets() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "houston-website-build",
  };
  // In GitHub Actions the workflow token avoids the shared-runner-IP limit.
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(RELEASES_API, { headers });
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const data = await res.json();
      return data.assets || [];
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

export default async function () {
  try {
    const urls = pickInstallerUrls(await fetchLatestAssets());
    for (const [key, url] of Object.entries(urls)) {
      if (!url) throw new Error(`latest release is missing asset for ${key}`);
    }
    console.log(`[release] baked installer fallbacks: ${urls.dmgUrl}`);
    return urls;
  } catch (err) {
    // CI: never ship a build without working download fallbacks.
    if (process.env.CI) {
      throw new Error(`[release] could not resolve installer URLs: ${err}`);
    }
    // Local/offline builds: warn and fall back to runtime-fetch-only behavior.
    console.warn(`[release] offline? baking empty fallbacks: ${err}`);
    return { dmgUrl: "", winX64Url: "", winArm64Url: "" };
  }
}
