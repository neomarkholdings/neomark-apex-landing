#!/usr/bin/env node
/**
 * Stages YARA and ClamAV next to the Tauri app so installers do not require
 * users to install scan engines themselves.
 *
 * Prefers binaries already on PATH (CI apt/brew). Otherwise downloads
 * official GitHub release zips for the host triple.
 *
 * tshark/Npcap is not vendored — packet capture needs an OS driver and a
 * license click-through. Linux .deb Depends still pull tshark via apt.
 */
import { execFileSync, execSync } from "node:child_process";
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENGINES = path.join(ROOT, "src-tauri", "engines");
const FORCE = process.argv.includes("--ci") || process.argv.includes("--force");

function log(message) {
  console.log(`[stage-engines] ${message}`);
}

function which(bin) {
  try {
    const probe = process.platform === "win32" ? "where" : "which";
    const out = execFileSync(probe, [bin], { encoding: "utf8" }).trim().split(/\r?\n/)[0];
    return out && existsSync(out) ? out : null;
  } catch {
    return null;
  }
}

function copyBinary(source, destName) {
  mkdirSync(ENGINES, { recursive: true });
  const dest = path.join(ENGINES, destName);
  copyFileSync(source, dest);
  if (process.platform !== "win32") {
    try {
      execFileSync("chmod", ["+x", dest]);
    } catch {
      // ignore
    }
  }
  log(`copied ${source} -> ${dest}`);
  return dest;
}

function copyDirFiles(fromDir, predicate) {
  mkdirSync(ENGINES, { recursive: true });
  for (const name of readdirSync(fromDir)) {
    const full = path.join(fromDir, name);
    if (!statSync(full).isFile()) {
      continue;
    }
    if (predicate && !predicate(name)) {
      continue;
    }
    copyFileSync(full, path.join(ENGINES, name));
  }
}

async function githubLatestAsset(repo, match) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "samurai-stage-engines",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers,
  });
  if (!response.ok) {
    throw new Error(`${repo} latest release: HTTP ${response.status}`);
  }
  const body = await response.json();
  const asset = (body.assets ?? []).find((item) => match(item.name));
  if (!asset) {
    throw new Error(`No matching asset on ${repo} ${body.tag_name}`);
  }
  return asset.browser_download_url;
}

async function download(url, dest) {
  mkdirSync(path.dirname(dest), { recursive: true });
  const response = await fetch(url, {
    headers: process.env.GITHUB_TOKEN
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      : undefined,
    redirect: "follow",
  });
  if (!response.ok || !response.body) {
    throw new Error(`download ${url}: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
  return dest;
}

function extractZip(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${destDir}'"`,
      { stdio: "inherit" },
    );
    return;
  }
  try {
    execFileSync("unzip", ["-o", zipPath, "-d", destDir], { stdio: "inherit" });
  } catch {
    throw new Error("unzip is required to extract engine zips");
  }
}

function findFile(root, names) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (names.includes(entry.name)) {
        return full;
      }
    }
  }
  return null;
}

function copyMacDeps(binaryPath) {
  if (process.platform !== "darwin") {
    return;
  }
  let libs = [];
  try {
    libs = execFileSync("otool", ["-L", binaryPath], { encoding: "utf8" })
      .split("\n")
      .slice(1)
      .map((line) => line.trim().split(" ")[0])
      .filter(Boolean);
  } catch {
    return;
  }
  for (const lib of libs) {
    if (
      lib.startsWith("/usr/lib/") ||
      lib.startsWith("/System/") ||
      lib.startsWith("@") ||
      lib === binaryPath
    ) {
      continue;
    }
    if (!existsSync(lib)) {
      continue;
    }
    const base = path.basename(lib);
    const dest = path.join(ENGINES, base);
    copyFileSync(lib, dest);
    try {
      execFileSync("install_name_tool", [
        "-change",
        lib,
        `@executable_path/${base}`,
        binaryPath,
      ]);
    } catch {
      // best effort
    }
  }
}

async function stageYara() {
  const destName = process.platform === "win32" ? "yara.exe" : "yara";
  if (existsSync(path.join(ENGINES, destName)) && !FORCE) {
    log("yara already staged");
    return;
  }
  const local = which("yara");
  if (local) {
    const dest = copyBinary(local, destName);
    copyMacDeps(dest);
    return;
  }
  if (process.platform !== "win32") {
    log("yara not on PATH; Linux/macOS CI should apt/brew install it");
    return;
  }
  log("downloading official YARA Windows build");
  const url = await githubLatestAsset(
    "VirusTotal/yara",
    (name) => /win64.*\.zip$/i.test(name) && !name.endsWith(".sig"),
  );
  const zip = path.join(ENGINES, "_yara.zip");
  const unpacked = path.join(ENGINES, "_yara_unpacked");
  await download(url, zip);
  extractZip(zip, unpacked);
  const found = findFile(unpacked, ["yara.exe", "yara64.exe"]);
  if (!found) {
    throw new Error("yara.exe missing from Windows zip");
  }
  copyBinary(found, "yara.exe");
  rmSync(zip, { force: true });
  rmSync(unpacked, { recursive: true, force: true });
}

async function stageClamav() {
  const destName = process.platform === "win32" ? "clamscan.exe" : "clamscan";
  if (existsSync(path.join(ENGINES, destName)) && !FORCE) {
    log("clamscan already staged");
    return;
  }
  const local = which("clamscan");
  if (local) {
    const dest = copyBinary(local, destName);
    copyMacDeps(dest);
    const fresh = which("freshclam");
    if (fresh) {
      copyBinary(fresh, process.platform === "win32" ? "freshclam.exe" : "freshclam");
      copyMacDeps(path.join(ENGINES, process.platform === "win32" ? "freshclam.exe" : "freshclam"));
    }
    return;
  }
  if (process.platform !== "win32") {
    log("clamscan not on PATH; Linux/macOS CI should apt/brew install it");
    return;
  }
  log("downloading official ClamAV Windows build");
  const url = await githubLatestAsset(
    "Cisco-Talos/clamav",
    (name) => name.includes("win.x64.zip") && !name.endsWith(".sig"),
  );
  const zip = path.join(ENGINES, "_clam.zip");
  const unpacked = path.join(ENGINES, "_clam_unpacked");
  await download(url, zip);
  extractZip(zip, unpacked);
  const clam = findFile(unpacked, ["clamscan.exe"]);
  if (!clam) {
    throw new Error("clamscan.exe missing from ClamAV zip");
  }
  const clamDir = path.dirname(clam);
  copyDirFiles(clamDir, (name) =>
    /\.(exe|dll|conf(\.sample)?)$/i.test(name),
  );
  rmSync(zip, { force: true });
  rmSync(unpacked, { recursive: true, force: true });
  log("staged ClamAV Windows payload");
}

async function main() {
  mkdirSync(ENGINES, { recursive: true });
  await stageYara();
  await stageClamav();
  const staged = readdirSync(ENGINES).filter((name) => !name.startsWith("."));
  log(`ready: ${staged.join(", ") || "(none — heuristic-only until CI/apt/brew)"}`);
}

await main();
