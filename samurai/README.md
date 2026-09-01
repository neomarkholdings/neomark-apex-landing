# Samurai // サムライ

Local endpoint detection & response for creators. Ronin Softworx / Neomark Holdings LLC.

**Samurai** hunts malware. **Amoeba** restores damaged hosts from *your* shadow copies. Creative sanctuary paths (`neomark`, `retroblazed`, `/Music`, `/Studio-Projects`) are immutable — no delete, quarantine, or rewrite.

This is a **desktop app** (Tauri). The real product is an installer, not a website. The Vite UI is a console preview.

## Run it now

### 1. Browser preview (UI only)

From `samurai/`:

```bash
npm install
npm run dev
```

Open http://localhost:1420. Scans use a sealed demo lab. YARA / ClamAV / tshark are not live in the browser.

### 2. Desktop app (the real product)

Install [Rust](https://rustup.rs/) (stable) and Node 20+, then:

```bash
cd samurai
npm install
npm run desktop
```

That launches the Tauri window (`tauri dev`) with the Rust backend.

**Windows:** [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (already on Win10/11) and [MSVC Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).

**macOS:** Xcode Command Line Tools (`xcode-select --install`).

**Linux:**

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

Optional scanners on PATH: `yara`, `clamscan`, `tshark`.

## Go live (ship installers)

Samurai is sold as a downloadable app for Windows, macOS, and Linux. Hosting it on Render or GitHub Pages does not replace the installer.

### One-time GitHub setup

1. Merge the Samurai PR into `main`.
2. Repo **Settings → Actions → General → Workflow permissions → Read and write**.
3. (Later, for stores / SmartScreen / Gatekeeper) add code-signing secrets. Unsigned builds still install; Windows and macOS will warn.

### Cut a release

```bash
git checkout main
git pull
git tag samurai-v0.1.0
git push origin samurai-v0.1.0
```

Or **Actions → Samurai release → Run workflow**.

GitHub Actions then builds:

| Platform | Artifact |
| --- | --- |
| Windows | NSIS `.exe` / `.msi` |
| macOS Apple Silicon | `.dmg` |
| macOS Intel | `.dmg` |
| Linux | `.deb` + AppImage |

A **draft** GitHub Release is created. Open it, attach notes, and publish. That URL is what you send to testers and later put on roninsoftworx.com / the Apex landing page.

### Build an installer on your machine

```bash
cd samurai
npm run desktop:build
```

Outputs land in `src-tauri/target/release/bundle/`.

## Product rules

- Scan engines: YARA, ClamAV (`clamscan`), tshark protocol sampling, plus a local heuristic. Results are reduced to a **Threat Score (0–100)** and one sentence — raw terminal output never hits the UI.
- Amoeba restores from `{parent}/.amoeba_shadow/{file}` (and a Volume Shadow Copy hook on Windows). It does not “optimize” or alter creations.
- Streamer shield redacts paths and suppresses packet telemetry.
- Any remediation targeting a sanctuary path aborts with:

  `ERR_SANCTUARY_ZONE: Target resides in an immutable protected sector. Action aborted.`
