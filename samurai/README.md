# Samurai // サムライ

Local endpoint detection & response for creators. Ronin Softworx / Neomark Holdings LLC.

**Samurai** hunts malware. **Amoeba** restores damaged hosts from *your* shadow copies. Creative sanctuary paths (`neomark`, `retroblazed`, `/Music`, `/Studio-Projects`) are immutable — no delete, quarantine, or rewrite.

This is a **desktop app**. People who download the installer do **not** need Node, Rust, YARA, or ClamAV. Those are packaged into the build.

Silver / blood-red Y2K metal console. Neon green is not used.

## Download (what users run)

After a signed release is published, each OS gets one file:

| OS | What they run | What is already inside |
| --- | --- | --- |
| Windows | NSIS setup `.exe` | Samurai + WebView2 bootstrapper + YARA + ClamAV |
| macOS | `.dmg` | Samurai + YARA + ClamAV (Gatekeeper-quiet only after notarization) |
| Linux | `.deb` | Samurai; apt also installs WebKit, YARA, ClamAV, and tshark |

Heuristic scanning is always on. **tshark** ships with the Linux `.deb`. It is not silently bundled on Windows/macOS because Npcap/Wireshark needs a driver EULA and admin rights. Creators who stream should leave **HIDE PATHS** on anyway.

ClamAV signatures may still download on first scan (`freshclam`) so the installer stays smaller than a full CVD snapshot.

Amoeba writes restore points as `{folder}/.amoeba_shadow/{filename}` for clean files under 8 MB. It never writes those copies inside protected folders.

## Windows Defender (coexist, do not disable)

Samurai does **not** turn off Microsoft Defender. Dual coverage is the point: Defender still scans Downloads and Desktop.

What *does* fight the product on Windows is Defender locking or deleting a drop while Samurai is moving it into the install-gate vault, or quarantining `samurai.exe` because it relocated an executable.

The NSIS installer (and the **ALIGN** control on the Windows line) asks Defender to skip **only**:

- the Samurai program folder
- bundled `yara.exe` / `clamscan.exe` / `freshclam.exe`
- `%APPDATA%\com.roninsoftworx.samurai` and the `install_gate` vault

It **never** excludes Downloads, Desktop, Music, or the whole disk. It **never** sets `DisableRealtimeMonitoring`. If real-time protection is already off, Samurai reports that and leaves Windows Security for the operator.

ALIGN prompts UAC. Per-user installs without admin can use ALIGN from the console after setup.

## Code signing (removes SmartScreen / Gatekeeper warnings)

Unsigned downloads work, but Windows SmartScreen and macOS Gatekeeper will warn. Signing is a **certificate purchase + GitHub secrets**. The build cannot invent a trusted identity.

### Windows (Authenticode)

1. Buy a **code signing** certificate (not an SSL cert).
   - **OV** (organization validated): cheaper; SmartScreen still warns until reputation builds.
   - **EV** (extended validation): more expensive; SmartScreen reputation starts immediately.
   - **Azure Trusted Signing** (Artifact Signing): Microsoft-hosted; often the fastest path for a company.
2. Export a `.pfx` and password.
3. Add GitHub Actions secrets:
   - `WINDOWS_CERTIFICATE` — base64 of the `.pfx` (`openssl base64 -A -in cert.pfx`)
   - `WINDOWS_CERTIFICATE_PASSWORD`
4. The release workflow imports the cert and signs with `signtool`. Timestamping uses DigiCert.

Until those secrets exist, Windows installers still build — they just stay unsigned.

### macOS (Developer ID + notarization)

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year).
2. Create a **Developer ID Application** certificate (not “Apple Development”, and not App Store Distribution unless you ship on the App Store).
3. Export the cert + private key as a `.p12`.
4. Create an [App Store Connect API key](https://appstoreconnect.apple.com/access/integrations) for notarization.
5. Add GitHub secrets:

| Secret | What it is |
| --- | --- |
| `APPLE_CERTIFICATE` | base64 of the `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | export password |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Ronin Softworx (TEAMID)` |
| `KEYCHAIN_PASSWORD` | any throwaway password for the CI keychain |
| `APPLE_API_ISSUER` | Issuer ID from App Store Connect |
| `APPLE_API_KEY` | Key ID |
| `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` | fallback Apple ID notarization |

Notarization is required. Signing without notarizing still shows “Apple cannot check it for malicious software.”

### Linux

`.deb` packages can be GPG-signed later (`dpkg-sig`). Users installing from your apt repo trust that key. A random downloaded `.deb` does not use SmartScreen or Gatekeeper.

## Ship a release

1. Repo **Settings → Actions → General → Workflow permissions → Read and write**.
2. Add the signing secrets above when the certs are in hand.
3. Tag and push:

```bash
git tag samurai-v0.1.0
git push origin samurai-v0.1.0
```

Or **Actions → Samurai release → Run workflow**.

GitHub builds Windows / macOS / Linux, stages YARA + ClamAV into the app, and opens a **draft** Release. Publish that draft — that URL is what you send to testers.

Local installer (developers):

```bash
cd samurai
npm run desktop:build
```

Outputs land in `src-tauri/target/release/bundle/`. `npm run engines:stage` copies YARA/ClamAV from PATH (or downloads the Windows zips) into `src-tauri/engines/` first.

## Develop on this repo

You need [Node 20+](https://nodejs.org/) and [Rust](https://rustup.rs/) (stable) **only if you are building from source**.

```bash
git clone https://github.com/neomarkholdings/neomark-apex-landing.git
cd neomark-apex-landing/samurai
npm install
npm run desktop
```

Click **BROWSE**, pick a folder, then **SCAN**. Leave the folder blank for the built-in self-test lab.

**Windows (from source):** [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) and [MSVC Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).

**macOS (from source):** `xcode-select --install`

**Linux (from source):**

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf yara clamav tshark
```

## Browser preview (UI only)

```bash
npm run dev
```

Open http://localhost:1420. Scans use the demo lab. BROWSE, YARA, ClamAV, and tshark are not live here. Tools live on a katana station rail — draw **PROTECTION**, **AMOEBA**, **INSTALL GATE**, **RESIDENT**, **WINDOWS LINE**, or **PRIVACY**. The scan table stays on the right.

## Tests

```bash
npm test
```

## Product rules

- Scan engines: local heuristic, **foothold hunt**, YARA, ClamAV (`clamscan`), and tshark protocol sampling. Results reduce to a **Threat Score (0–100)** and one sentence — raw terminal output never hits the UI.
- **Install gate** watches Downloads and Desktop (plus OneDrive Desktop/Downloads on Windows) on the desktop app. Named crack/keygen/activator bait, **nested keygens inside `.zip` / `.rar` / `.7z` / SFX installers**, double-extension drops, and system binaries masquerading outside System32 are **moved into an install-gate vault** before they can run. Sample packs named `crackle` are left alone. Sanctuary (`/Music`, `/Studio-Projects`, `neomark`, `retroblazed`) is alert-only — never held, never rewritten. A false-positive hold can be **RELEASE**d back to the drop folder. Holds retry when Windows Defender still has the file open. Protection is on by default; **DISARM** pauses holds for 15 minutes (or until you switch ON). Sanctuary stays locked. Disarm does not survive an app restart.
- **Resident tray** is the daily product. The desktop app sits in the taskbar, starts at boot unless you switch AT BOOT off, and keeps the install-gate watch running with the console closed. A hold updates the tray tooltip (`Samurai · held a drop`) and does **not** pop the window, toast, play a sound, or steal focus. Close the window or press **SIT** to return to the tray; **Quit Samurai** from the tray menu is the only full exit. After the first launch, later starts (including autostart `--silent`) stay in the tray until you click it.
- **Windows line** asks Defender to ignore Samurai's own folders and engine processes so the two scanners do not deadlock. Defender real-time protection stays on. Downloads are never excluded.
- **Foothold hunt** flags executables disguised as `.wav` / DAW projects, ransom-note filenames, and hostile autostart. It **reports** those hits. Content infections still restore from `.amoeba_shadow` outside sanctuary.
- Amoeba restores from `{parent}/.amoeba_shadow/{file}` (and a Volume Shadow Copy hook on Windows). It does not “optimize” or alter creations. Foothold hits stay detect-only so a fake sample pack is never silently deleted from a session folder.
- Streamer shield redacts paths and suppresses packet telemetry.
- Any remediation targeting a sanctuary path aborts with:

  `ERR_SANCTUARY_ZONE: Target resides in an immutable protected sector. Action aborted.`
