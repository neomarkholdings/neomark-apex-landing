# Neomark Apex — SEO Landing Page 
2026 GLP-1 Medicaid coverage searches and routes traffic to the Neomark Apex
Snowflake Marketplace listing.

## Files


| File         | Purpose                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| `index.html` | The full page: SEO `<head>`, JSON-LD (Organization + Article + FAQ), semantic content, one primary CTA. |
| `styles.css` | Dark theme (accent green `#22c55e` on `#0e1116`), mobile-responsive, no frameworks.                     |


There are **no external JS or CDN dependencies** — the page is intentionally
static so it loads instantly (good Core Web Vitals = better SEO).

## Before you publish

1. **Swap the CTA URL.** Every "Access the Data instantly on Snowflake" button
  currently points to the placeholder `https://app.snowflake.com/marketplace`.
   Replace it with your real published listing URL once the Marketplace listing
   is live (see `../MARKETPLACE_LISTING.md`). Search for the string in
   `index.html` and replace all occurrences.
2. **Set the real domain.** Replace `https://neomark.io/` in the `<link rel="canonical">`,
  Open Graph, Twitter, and JSON-LD tags with your actual domain.
3. **Add `og-image.png`** (recommended 1200×630) to this folder for rich social
  previews. The tags already reference `og-image.png`.
4. (Optional) Add a `favicon.ico` and a `sitemap.xml` / `robots.txt` at the site root.

## Deploy — GitHub Pages

```bash
# From a repo that contains this landing/ folder:
git add landing
git commit -m "Add Neomark Apex SEO landing page"
git push origin main
```

Then in the repo: **Settings → Pages → Build and deployment**

- Source: **Deploy from a branch**
- Branch: `main`, folder `/landing` (or move the files to `/docs` and select `/docs`).

For a clean root URL, you can instead put `index.html` + `styles.css` at the repo
root of a `username.github.io` repo. Add a `CNAME` file containing your custom
domain to use `neomark.io`.



