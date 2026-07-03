import { marked } from "marked";
import {
  isoDate,
  isoDateOnly,
  readableDate,
  readingTimeMinutes,
} from "./lib/blog.js";

marked.setOptions({ gfm: true, breaks: false });

export default function (eleventyConfig) {
  // Render a markdown string to HTML. Used by the changelog page to render
  // GitHub release bodies fetched at build time.
  eleventyConfig.addFilter("markdown", (str) => {
    if (!str) return "";
    return marked.parse(str);
  });

  // Blog filters (pure logic lives in lib/blog.js, unit-tested via `npm test`)
  eleventyConfig.addFilter("readingTime", readingTimeMinutes);
  eleventyConfig.addFilter("readableDate", readableDate);
  eleventyConfig.addFilter("isoDate", isoDate);
  eleventyConfig.addFilter("isoDateOnly", isoDateOnly);

  // Pass through static assets unchanged
  eleventyConfig.addPassthroughCopy("src/favicon.svg");
  eleventyConfig.addPassthroughCopy("src/houston-black.svg");
  eleventyConfig.addPassthroughCopy("src/houston-gray.svg");
  // Square logo (768x768) used by the Organization structured data.
  eleventyConfig.addPassthroughCopy("src/houston-icon.png");
  eleventyConfig.addPassthroughCopy("src/og-image.jpg");
  eleventyConfig.addPassthroughCopy("src/icons");
  eleventyConfig.addPassthroughCopy("src/learn/style.css");
  eleventyConfig.addPassthroughCopy("src/blog/blog.css");
  eleventyConfig.addPassthroughCopy("src/slack");
  eleventyConfig.addPassthroughCopy("src/auth");
  eleventyConfig.addPassthroughCopy("src/_headers");
  eleventyConfig.addPassthroughCopy("src/_redirects");
  // SEO + AI-crawler files. Served verbatim at the site root (/robots.txt,
  // /llms.txt). The sitemap is now a generated template (src/sitemap.njk) so
  // blog posts can never be forgotten. The 404 page is a template with its
  // own permalink, so it does not need a passthrough entry.
  eleventyConfig.addPassthroughCopy("src/robots.txt");
  eleventyConfig.addPassthroughCopy("src/llms.txt");

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
