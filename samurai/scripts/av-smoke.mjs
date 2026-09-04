import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const BASE = process.env.SAMURAI_URL ?? "http://127.0.0.1:1420";
const SCREENSHOT_DIR = "/opt/cursor/artifacts/screenshots";
const SANCTUARY_ABORT =
  "ERR_SANCTUARY_ZONE: Target resides in an immutable protected sector. Action aborted.";

let failed = 0;
let passed = 0;

function check(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`ok ${passed + failed} ${message}`);
    return;
  }
  failed += 1;
  console.error(`not ok ${passed + failed} ${message}`);
}

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) {
        return;
      }
    } catch {
      // keep polling
    }
    await sleep(300);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startViteIfNeeded() {
  if (process.env.SAMURAI_URL) {
    return null;
  }
  try {
    const response = await fetch(BASE, { redirect: "manual" });
    if (response.status < 500) {
      return null;
    }
  } catch {
    // spawn below
  }
  const child = spawn("npm", ["run", "dev"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "pipe",
    detached: true,
  });
  return child;
}

async function boot(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^SCAN$/ }).waitFor({ timeout: 15000 });
  await page.getByText("NO SCAN YET").waitFor({ timeout: 15000 });
}

async function waitForScanIdle(page) {
  await page.getByRole("button", { name: /^SCAN$/ }).waitFor({ state: "visible", timeout: 20000 });
}

async function runScan(page) {
  await page.getByRole("button", { name: /^SCAN$/ }).click();
  await waitForScanIdle(page);
}

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const vite = await startViteIfNeeded();
  try {
    await waitForServer(BASE, 20000);
    const browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome-stable",
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--headless=new"],
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

    await boot(page);
    const idle = await page.locator("body").innerText();
    check(idle.includes("PROTECTED"), "idle chassis shows PROTECTED");
    check(idle.includes("NO SCAN YET"), "idle chassis has not scanned yet");
    check(idle.includes("/Music"), "protected folders list /Music");
    check(idle.includes("/Studio-Projects"), "protected folders list /Studio-Projects");
    check(
      await page.getByRole("button", { name: /^BROWSE$/ }).isVisible(),
      "BROWSE is available to pick a real folder",
    );
    check(
      await page.getByRole("button", { name: /^RESTORE$/ }).isDisabled(),
      "RESTORE stays disabled until Amoeba is waiting",
    );
    check(
      await page.getByRole("button", { name: /^RELEASE$/ }).isDisabled(),
      "RELEASE stays disabled until the install gate holds a drop",
    );
    check(idle.includes("WINDOWS LINE"), "idle chassis shows the Windows Defender line");
    check(
      idle.toLowerCase().includes("never downloads") ||
        idle.toLowerCase().includes("never Downloads".toLowerCase()),
      "Windows line copy refuses to exclude Downloads",
    );
    check(
      await page.getByRole("button", { name: /^ALIGN$/ }).isVisible(),
      "ALIGN is available to request Samurai-folder Defender exclusions",
    );
    await page.getByRole("button", { name: /^ALIGN$/ }).click();
    const aligned = await page.locator("body").innerText();
    check(
      aligned.toLowerCase().includes("never downloads") ||
        aligned.toLowerCase().includes("real-time protection stays on"),
      "ALIGN on the preview host does not disable Defender",
    );
    await page.screenshot({ path: `${SCREENSHOT_DIR}/samurai_av_idle.png`, fullPage: true });

    await page.getByRole("switch", { name: "Protection" }).click();
    await page.locator(".protect-pill").getByText("DISARMED").waitFor({ timeout: 15000 });
    const disarmedIdle = await page.locator(".protect-pill").innerText();
    check(disarmedIdle.includes("DISARMED"), "Protection switch flips the chassis pill to DISARMED");
    check(!disarmedIdle.includes("PROTECTED"), "disarm does not keep saying PROTECTED");
    const disarmedBody = await page.locator("body").innerText();
    check(
      disarmedBody.toLowerCase().includes("sanctuary stays locked") ||
        disarmedBody.toLowerCase().includes("holds are paused"),
      "disarm copy says holds pause and sanctuary stays locked",
    );
    check(/RE-ARM \d+:\d{2}/.test(disarmedBody), "disarm shows a re-arm countdown");
    await page.getByRole("switch", { name: "Protection" }).click();
    await page.locator(".protect-pill").getByText("PROTECTED", { exact: true }).waitFor({
      timeout: 15000,
    });
    check(
      (await page.locator(".protect-pill").innerText()).includes("PROTECTED"),
      "switching Protection ON restores PROTECTED",
    );

    await page.getByRole("button", { name: /^BROWSE$/ }).click();
    check(
      (await page.locator("body").innerText()).includes("Folder picker is in the desktop app"),
      "browser preview explains that BROWSE needs the desktop app",
    );

    await page.locator('button[role="switch"]').filter({ hasText: "ASK" }).click();
    await runScan(page);
    const askText = await page.locator("body").innerText();
    check(askText.includes("AWAITING"), "ASK scan stages an awaiting restore");
    check(askText.includes("AT RISK") || askText.includes("THREATS FOUND"), "ASK scan raises the threat band");
    check(
      await page.getByRole("button", { name: /^RESTORE$/ }).isEnabled(),
      "RESTORE is armed after an ASK detection",
    );
    await page.screenshot({ path: `${SCREENSHOT_DIR}/samurai_av_ask.png`, fullPage: true });

    await page.getByRole("button", { name: /^RESTORE$/ }).click();
    await waitForScanIdle(page);
    await page.getByText("No threats in the last scan").waitFor({ timeout: 15000 });
    const restoredText = await page.locator("body").innerText();
    check(restoredText.includes("No threats in the last scan"), "ASK restore rescans to a clean table");
    check(/SIGNATURES 01/.test(restoredText), "ASK restore records one signature");
    check(
      await page.getByRole("button", { name: /^RESTORE$/ }).isDisabled(),
      "RESTORE disarms after a successful restore",
    );

    await runScan(page);
    check(
      (await page.locator("body").innerText()).includes("No threats in the last scan"),
      "second scan after ASK restore stays clean",
    );

    await boot(page);
    await runScan(page);
    const autoText = await page.locator("body").innerText();
    check(autoText.includes("RESTORED"), "AUTO scan restores without a prompt");
    check(/SIGNATURES 01/.test(autoText), "AUTO restore records one signature");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/samurai_av_scan.png`, fullPage: true });

    await runScan(page);
    check(
      (await page.locator("body").innerText()).includes("No threats in the last scan"),
      "second scan after AUTO restore stays clean",
    );

    await boot(page);
    await page.locator('button[role="switch"]').filter({ hasText: "HIDE PATHS" }).click();
    await runScan(page);
    const streamText = await page.locator("body").innerText();
    check(streamText.includes("[STREAM-SHIELD]/tainted.txt"), "privacy mode redacts the host path");
    check(!streamText.includes("/tmp/samurai-lab/tainted.txt"), "privacy mode hides the raw lab path");
    check(streamText.toLowerCase().includes("streamer shield"), "privacy mode mentions the streamer shield");
    check(
      await page.locator('span[title*="Streamer shield"]').count().then((n) => n > 0),
      "tshark engine notes that the shield suppressed capture",
    );

    const markers = [
      { value: "/Music", label: "/Music" },
      { value: "/Studio-Projects", label: "/Studio-Projects" },
      { value: "/tmp/neomark/vault.bin", label: "neomark" },
      { value: "/tmp/retroblazed/mix.wav", label: "retroblazed" },
    ];
    for (const marker of markers) {
      await page.locator('input[placeholder*="built-in test folder"]').fill(marker.value);
      await runScan(page);
      const body = await page.locator("body").innerText();
      check(body.includes(SANCTUARY_ABORT), `scan of ${marker.label} shows the exact sanctuary abort`);
    }
    await page.getByRole("switch", { name: "Protection" }).click();
    await page.locator(".protect-pill").getByText("DISARMED").waitFor({ timeout: 15000 });
    await page.locator('input[placeholder*="built-in test folder"]').fill("/Music");
    await runScan(page);
    check(
      (await page.locator("body").innerText()).includes(SANCTUARY_ABORT),
      "sanctuary abort still fires while protection is disarmed",
    );
    await page.getByRole("switch", { name: "Protection" }).click();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/samurai_av_sanctuary.png`, fullPage: true });

    await page.locator('input[placeholder*="built-in test folder"]').fill("/tmp/downloads/invoice.pdf");
    await runScan(page);
    const allowed = await page.locator("body").innerText();
    check(!allowed.includes("ERR_SANCTUARY_ZONE"), "unrelated paths do not sanctuary-abort");
    check(allowed.includes("No threats in the last scan"), "unrelated paths do not invent a lab antigen");

    await page.locator('input[placeholder*="built-in test folder"]').fill("/tmp/pack/kick.wav.exe");
    await runScan(page);
    const bait = await page.locator("body").innerText();
    check(bait.includes("Double-extension"), "foothold hunt flags a disguised .wav.exe drop");
    check(bait.includes("Foothold hunt") || bait.toUpperCase().includes("FOOTHOLD"), "foothold hunt is visible on the chassis");
    check(
      await page.getByRole("button", { name: /^RESTORE$/ }).isDisabled(),
      "Amoeba does not arm RESTORE for a foothold report — no silent quarantine",
    );

    await page.locator('input[placeholder*="built-in test folder"]').fill("/tmp/Downloads/FLStudio-crack.exe");
    await runScan(page);
    const warez = await page.locator("body").innerText();
    check(
      warez.includes("Crack/keygen") || warez.toLowerCase().includes("crack/keygen"),
      "install gate flags a crack/keygen drop",
    );
    check(warez.includes("INSTALL GATE") || warez.includes("Install gate held"), "install gate hold is visible");
    check(warez.includes("HELD") || warez.includes("ARMED"), "install gate shows a held or armed state");
    check(
      await page.getByRole("button", { name: /^RESTORE$/ }).isDisabled(),
      "Amoeba does not restore a held crack drop",
    );
    check(
      await page.getByRole("button", { name: /^RELEASE$/ }).isEnabled(),
      "RELEASE is armed after a held crack drop",
    );

    await boot(page);
    await page.locator('input[placeholder*="built-in test folder"]').fill("/tmp/Downloads/Ableton_Live_12.zip");
    await runScan(page);
    const nested = await page.locator("body").innerText();
    check(
      nested.includes("Archive contains a crack/keygen") || nested.toLowerCase().includes("nested"),
      "install gate peeks inside a DAW-named zip for a nested keygen",
    );
    check(nested.includes("HELD") || nested.includes("INSTALL GATE"), "nested keygen zip is held");
    check(
      await page.getByRole("button", { name: /^RESTORE$/ }).isDisabled(),
      "Amoeba does not restore a nested archive hold",
    );

    await boot(page);
    await page.locator('input[placeholder*="built-in test folder"]').fill("/tmp/Downloads/crackle-pack.zip");
    await runScan(page);
    const pack = await page.locator("body").innerText();
    check(pack.includes("No threats in the last scan"), "crackle sample pack is not treated as warez");
    check(!pack.includes("GATE HOLD"), "crackle-pack.zip does not trip a live gate hold");

    await boot(page);
    await page.waitForFunction(() => Boolean(window.__SAMURAI_DEMO__), { timeout: 15000 });
    await page.evaluate(async () => {
      await window.__SAMURAI_DEMO__.simulateDrop("/tmp/Downloads/Ableton_Live_12.zip", [
        "Ableton Live 12/Setup.exe",
        "Ableton Live 12/keygen.exe",
      ]);
    });
    await page.locator(".protect-pill").getByText("GATE HOLD").waitFor({ timeout: 15000 });
    const liveDrop = await page.locator("body").innerText();
    check(liveDrop.includes("GATE HOLD"), "live nested drop flips the chassis to GATE HOLD without a scan");
    check(
      liveDrop.includes("Archive contains") || liveDrop.toLowerCase().includes("keygen"),
      "live nested drop names the inner keygen",
    );
    check(
      await page.getByRole("button", { name: /^RELEASE$/ }).isEnabled(),
      "RELEASE is armed after a live hold",
    );
    await page.screenshot({ path: `${SCREENSHOT_DIR}/samurai_av_gate_hold.png`, fullPage: true });
    await page.getByRole("button", { name: /^RELEASE$/ }).click();
    await page.locator(".protect-pill").getByText("PROTECTED", { exact: true }).waitFor({ timeout: 15000 });
    check(
      await page.getByRole("button", { name: /^RELEASE$/ }).isDisabled(),
      "RELEASE disarms after the drop is returned",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/samurai_av_mobile.png`, fullPage: true });

    await browser.close();
  } finally {
    if (vite?.pid) {
      try {
        process.kill(-vite.pid, "SIGTERM");
      } catch {
        vite.kill("SIGTERM");
      }
    }
  }

  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

await main();
