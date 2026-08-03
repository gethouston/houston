import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

export default function (eleventyConfig) {
  // Render a markdown string to HTML. Used by the changelog page to render
  // GitHub release bodies fetched at build time.
  eleventyConfig.addFilter("markdown", (str) => {
    if (!str) return "";
    return marked.parse(str);
  });

  // Serialize a data value for embedding inside a <script> element. Escapes
  // `<` (so a string can never open a tag) plus U+2028 / U+2029, which are
  // valid in JSON but are line terminators in JavaScript. Used by
  // _includes/landing/i18n-data.njk to ship the runtime translations.
  eleventyConfig.addFilter("jsonScript", (v) =>
    JSON.stringify(v)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029"),
  );

  // Pass through static assets unchanged
  eleventyConfig.addPassthroughCopy("src/favicon.svg");
  eleventyConfig.addPassthroughCopy("src/houston-black.svg");
  eleventyConfig.addPassthroughCopy("src/houston-gray.svg");
  // Square logo (768x768) used by the Organization structured data.
  eleventyConfig.addPassthroughCopy("src/houston-icon.png");
  eleventyConfig.addPassthroughCopy("src/og-image.jpg");
  eleventyConfig.addPassthroughCopy("src/icons");
  // Static assets served verbatim from /assets/** — no bundler, no runtime CDN.
  // Includes the marketing landing's token layer + CSS + self-hosted woff2
  // fonts (assets/css, assets/fonts), the ESO Milky Way space background used by
  // the landing hero and the shared space-bg partial, and its scroll parallax.
  eleventyConfig.addPassthroughCopy("src/assets");
  // Vendored docs (e.g. assets/vendor/README.md licence note) ship verbatim via
  // the passthrough above; don't also let Eleventy render them as site pages.
  eleventyConfig.ignores.add("src/assets/**/*.md");
  eleventyConfig.addPassthroughCopy("src/learn/style.css");
  eleventyConfig.addPassthroughCopy("src/developers/style.css");
  eleventyConfig.addPassthroughCopy("src/guides/style.css");
  // Workshop guides: screenshots + downloadable PDFs and agent file
  eleventyConfig.addPassthroughCopy("src/guides/assets");
  eleventyConfig.addPassthroughCopy("src/guides/downloads");
  eleventyConfig.addPassthroughCopy("src/slack");
  eleventyConfig.addPassthroughCopy("src/auth");
  eleventyConfig.addPassthroughCopy("src/_headers");
  eleventyConfig.addPassthroughCopy("src/_redirects");
  // SEO + AI-crawler files. Served verbatim at the site root (/robots.txt,
  // /llms.txt). The 404 page and the sitemap are templates with their own
  // permalinks, so they do not need passthrough entries.
  eleventyConfig.addPassthroughCopy("src/robots.txt");
  eleventyConfig.addPassthroughCopy("src/llms.txt");

  // Certificate images. Every issued certificate gets a printable PNG and a
  // social card written into _site/c/ after the site is written — the same
  // build-time export the /c/ pages are generated from, rendered with satori +
  // resvg (see lib/certs/render.mjs). Imported lazily so the image toolchain is
  // only loaded when a build actually runs.
  eleventyConfig.on("eleventy.after", async ({ dir }) => {
    const { renderAllCertificates } = await import("./lib/certs/render.mjs");
    await renderAllCertificates(dir.output);
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
    },
    // Use Nunjucks for HTML files
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
}
