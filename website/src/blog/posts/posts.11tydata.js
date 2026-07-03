// Directory data for every blog post in this folder. Posts are plain
// Markdown files; this file gives them their layout, clean URLs, and the
// "posts" collection tag so the index, feed, and sitemap pick them up
// automatically. Writers only ever add .md files here.
export default {
  layout: "blog-post.njk",
  tags: ["posts"],
  permalink: "/blog/{{ page.fileSlug }}/",
};
