// Fetched at build time. Eleventy 3.x supports async data files.
// Falls back to an empty list if GitHub is unreachable so builds never break.
const REPO = "gethouston/houston";
const PER_PAGE = 30;

export default async function () {
  try {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "houston-website-build",
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases?per_page=${PER_PAGE}`,
      { headers },
    );
    if (!res.ok) {
      console.warn(
        `[changelog] GitHub API ${res.status}; rendering empty list.`,
      );
      return [];
    }
    const releases = await res.json();
    return releases
      .filter((r) => !r.draft)
      .map((r) => {
        const date = new Date(r.published_at);
        return {
          tag: r.tag_name,
          name: r.name || r.tag_name,
          publishedAt: r.published_at,
          publishedDate: date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
          body: r.body || "",
          url: r.html_url,
          isPrerelease: !!r.prerelease,
          dmgAsset:
            (r.assets || []).find((a) => a.name.endsWith(".dmg")) || null,
        };
      });
  } catch (err) {
    console.warn("[changelog] fetch failed:", err.message);
    return [];
  }
}
