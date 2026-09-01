# Samurai // サムライ

Local endpoint detection & response for creators. Ronin Softworx / Neomark Holdings LLC.

**Samurai** hunts malware. **Amoeba** restores damaged hosts from *your* shadow copies. Creative sanctuary paths (`neomark`, `retroblazed`, `/Music`, `/Studio-Projects`) are immutable — no delete, quarantine, or rewrite.

Silver / blood-red Y2K metal console. Neon green is not used.

## Phase 1 — scaffolding

```bash
# 1. Tauri v2 + Vite + React 19 + TypeScript
npm create tauri-app@latest samurai -- --template react-ts --manager npm --yes --identifier com.roninsoftworx.samurai --tauri-version 2

cd samurai

# 2. Tailwind CSS v4 via the Vite plugin
npm install
npm install -D tailwindcss @tailwindcss/vite

# 3. Icons + readout fonts
npm install lucide-react @fontsource/orbitron @fontsource/share-tech-mono @fontsource/noto-sans-jp
```

Enable Tailwind in `vite.config.ts` with `import tailwindcss from "@tailwindcss/vite"` and `plugins: [react(), tailwindcss()]`. Import Tailwind in `src/index.css` with `@import "tailwindcss";`.

## Run

```bash
npm run dev          # UI console (browser / Vite)
npm run tauri dev    # desktop webview (needs WebKitGTK on Linux)
npm test -s --prefix . 2>/dev/null || cargo test --manifest-path src-tauri/Cargo.toml
```

The Vite UI talks to the Rust backend inside Tauri. In a plain browser it uses a sealed demo lab so the console still scans, toggles, and restores.

## Product rules

- Scan engines: YARA, ClamAV (`clamscan`), tshark protocol sampling, plus a local heuristic. Results are reduced to a **Threat Score (0–100)** and one sentence — raw terminal output never hits the UI.
- Amoeba restores from `{parent}/.amoeba_shadow/{file}` (and a Volume Shadow Copy hook on Windows). It does not “optimize” or alter creations.
- Streamer shield redacts paths and suppresses packet telemetry.
- Any remediation targeting a sanctuary path aborts with:

  `ERR_SANCTUARY_ZONE: Target resides in an immutable protected sector. Action aborted.`
