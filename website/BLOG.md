# Publishing a blog post

Posts are Markdown files in `website/src/blog/posts/`. One file = one post.
Everything else (index page, feed, sitemap, meta tags) updates automatically.

## Steps

1. Create a branch named `blog/<slug>`, e.g. `blog/agents-for-founders`.
   CI enforces that `blog/*` branches only change files in
   `website/src/blog/posts/`, so a writing session cannot touch the rest of
   the site.
2. Add `website/src/blog/posts/<slug>.md`. The file name becomes the URL:
   `<slug>.md` publishes at `https://gethouston.ai/blog/<slug>/`.
3. Front matter (all required unless marked optional):

   ```yaml
   ---
   title: "Your post title"
   description: "One or two sentences. Used in the index, meta tags, and feed."
   author: "Full Name"
   date: 2026-07-02
   ogImage: /blog/my-post/cover.jpg   # optional social card override
   ---
   ```

4. Write the body in plain Markdown. Headings start at `##` (the title is the
   `#`). No em dashes in copy.
5. Open a PR to `main`. CI builds the site, runs tests, and posts a
   Cloudflare Pages preview URL in the workflow summary. Review the preview.
6. Merge. The production deploy to gethouston.ai runs automatically.

## Notes

- Dates are UTC. A post dated today appears at the top of `/blog/`.
- The Atom feed lives at `/blog/feed.xml`; the sitemap picks up posts
  automatically.
- Custom OG images belong in the post's own folder under
  `website/src/blog/posts/` only if passthrough-copied; simpler: reuse the
  default site card by omitting `ogImage`.
