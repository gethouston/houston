import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

export default function (eleventyConfig) {
  // Render a markdown string to HTML. Used by the changelog page to render
  // GitHub release bodies fetched at build time.
  eleventyConfig.addFilter("markdown", (str) => {
    if (!str) return "";
    return marked.parse(str);
  });

  // Pass through static assets unchanged
  eleventyConfig.addPassthroughCopy("src/favicon.svg");
  eleventyConfig.addPassthroughCopy("src/houston-black.svg");
  eleventyConfig.addPassthroughCopy("src/houston-gray.svg");
  eleventyConfig.addPassthroughCopy("src/og-image.jpg");
  eleventyConfig.addPassthroughCopy("src/icons");
  eleventyConfig.addPassthroughCopy("src/learn/style.css");
  eleventyConfig.addPassthroughCopy("src/slack");
  eleventyConfig.addPassthroughCopy("src/auth");
  eleventyConfig.addPassthroughCopy("src/_headers");
  eleventyConfig.addPassthroughCopy("src/_redirects");

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
