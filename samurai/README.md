# Samurai // サムライ

Local endpoint detection & response for creators. Ronin Softworx / Neomark Holdings LLC.

**Samurai** hunts malware. **Amoeba** restores damaged hosts from *your* shadow copies. Creative sanctuary paths (`neomark`, `retroblazed`, `/Music`, `/Studio-Projects`) are immutable — no delete, quarantine, or rewrite.

This is a **desktop app**. The browser preview is a sealed demo lab. Full engines, folder browse, and real restores only run in the Tauri window.

Silver / blood-red Y2K metal console. Neon green is not used.

## Use it on your computer

You need [Node 20+](https://nodejs.org/) and [Rust](https://rustup.rs/) (stable).

```bash
git clone https://github.com/neomarkholdings/neomark-apex-landing.git
cd neomark-apex-landing/samurai
npm install
npm run desktop
```

That opens the Samurai window. Click **BROWSE**, pick a folder, then **SCAN**. Leave the folder blank to use the built-in self-test lab.

### Windows

- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (already on Windows 10/11)
- [MSVC Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the “Desktop development with C++” workload

### macOS

```bash
xcode-select --install
```

### Linux

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

### Full scan engines (optional, recommended)

Heuristic scanning is always on. Install these on PATH and they light up in the console:

| Engine | What it adds |
| --- | --- |
| **YARA** | Rule match on the self-test antigen and any rules you add later |
| **ClamAV** (`clamscan`) | Signature malware detection |
| **tshark** | Protocol sampling only (paused when HIDE PATHS is on) |

```bash
# macOS
brew install yara clamav wireshark

# Ubuntu / Debian
sudo apt install yara clamav tshark

# Windows (winget)
winget install VirusTotal.YARA
winget install Cisco.ClamAV
winget install WiresharkFoundation.Wireshark
```

After install, restart Samurai. The engine pills should flip from OFF to ON.

Amoeba writes restore points as `{folder}/.amoeba_shadow/{filename}` for clean files under 8 MB. It never writes those copies inside protected folders.

## Browser preview (UI only)

```bash
npm run dev
```

Open http://localhost:1420. Scans use the demo lab. BROWSE, YARA, ClamAV, and tshark are not live here.

## Tests

```bash
npm test
```

## Ship installers

After this lands on `main`:

1. Repo **Settings → Actions → General → Workflow permissions → Read and write**.
2. Tag and push:

```bash
git tag samurai-v0.1.0
git push origin samurai-v0.1.0
```

Or **Actions → Samurai release → Run workflow**.

| Platform | Artifact |
| --- | --- |
| Windows | NSIS `.exe` |
| macOS Apple Silicon / Intel | `.dmg` |
| Linux | `.deb` + AppImage |

Unsigned builds show SmartScreen / Gatekeeper warnings until we add signing.

Local installer:

```bash
npm run desktop:build
```

Outputs land in `src-tauri/target/release/bundle/`.

## Product rules

- Scan engines: YARA, ClamAV (`clamscan`), tshark protocol sampling, plus a local heuristic. Results are reduced to a **Threat Score (0–100)** and one sentence — raw terminal output never hits the UI.
- Amoeba restores from `{parent}/.amoeba_shadow/{file}` (and a Volume Shadow Copy hook on Windows). It does not “optimize” or alter creations.
- Streamer shield redacts paths and suppresses packet telemetry.
- Any remediation targeting a sanctuary path aborts with:

  `ERR_SANCTUARY_ZONE: Target resides in an immutable protected sector. Action aborted.`
