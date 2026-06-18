# Neomark Apex — SEO Landing Page 
2026 GLP-1 Medicaid coverage searches and routes traffic to the Neomark Apex
Snowflake Marketplace listing.

## Files


| File         | Purpose                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| `index.html` | The full page: SEO `<head>`, JSON-LD (Organization + Article + FAQ), semantic content, one primary CTA. |
| `styles.css` | Dark theme (accent green `#22c55e` on `#0e1116`), mobile-responsive, no frameworks.                     |


There are **no external JS or CDN dependencies** — the page is intentionally
static so it loads instantly (good Core Web Vitals = better SEO)

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



