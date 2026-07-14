// Pure asset-picking logic for src/_data/release.js, kept outside _data
// because Eleventy treats named exports in data files as data keys (which
// silently breaks the default export's value). Also imported by tests.
export function pickInstallerUrls(assets) {
  const find = (re) => {
    const a = (assets || []).find((a) => re.test(a.name));
    return a ? a.browser_download_url : "";
  };
  return {
    dmgUrl: find(/\.dmg$/),
    winX64Url: find(/_x64.*\.msi$/),
    winArm64Url: find(/_arm64.*\.msi$/),
  };
}
