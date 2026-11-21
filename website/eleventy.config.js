import { marked } from "marked";
import { EXPORT_TOKEN } from "./lib/certs/config.mjs";

marked.setOptions({ gfm: true, breaks: false });

export default function (eleventyConfig) {
  eleventyConfig.addFilter("markdown", (str) => {
    if (!str) return "";
    return marked.parse(str);
  });

  eleventyConfig.addFilter("jsonScript", (v) =>
    JSON.stringify(v)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029"),
  );

  eleventyConfig.addPassthroughCopy("src/favicon.svg");
  eleventyConfig.addPassthroughCopy("src/houston-black.svg");
  eleventyConfig.addPassthroughCopy("src/houston-gray.svg");
  eleventyConfig.addPassthroughCopy("src/houston-icon.png");
  eleventyConfig.addPassthroughCopy("src/og");
  eleventyConfig.addPassthroughCopy("src/icons");
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.ignores.add("src/assets/**/*.md");
  eleventyConfig.addPassthroughCopy("src/learn/style.css");
  eleventyConfig.addPassthroughCopy("src/developers/style.css");
  eleventyConfig.addPassthroughCopy("src/guides/style.css");
  eleventyConfig.addPassthroughCopy("src/guides/assets");
  eleventyConfig.addPassthroughCopy("src/guides/downloads");
  eleventyConfig.addPassthroughCopy("src/slack");
  eleventyConfig.addPassthroughCopy("src/auth");
  eleventyConfig.addPassthroughCopy("src/invite");
  eleventyConfig.addPassthroughCopy("src/_headers");
  eleventyConfig.addPassthroughCopy("src/_redirects");
  eleventyConfig.addPassthroughCopy("src/robots.txt");
  eleventyConfig.addPassthroughCopy("src/llms.txt");

  const certificatesBuilt = EXPORT_TOKEN !== "";
  eleventyConfig.addGlobalData("certificatesBuilt", certificatesBuilt);
  if (certificatesBuilt) {
    eleventyConfig.on("eleventy.after", async ({ dir }) => {
      const { renderAllCertificates } = await import("./lib/certs/render.mjs");
      await renderAllCertificates(dir.output);
    });
  } else {
    eleventyConfig.ignores.add("src/certificates/**");
  }

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
}
