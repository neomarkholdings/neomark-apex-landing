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
    await page.screenshot({ path: `${SCREENSHOT_DIR}/samurai_av_idle.png`, fullPage: true });

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
    await page.screenshot({ path: `${SCREENSHOT_DIR}/samurai_av_sanctuary.png`, fullPage: true });

    await page.locator('input[placeholder*="built-in test folder"]').fill("/tmp/downloads/invoice.pdf");
    await runScan(page);
    const allowed = await page.locator("body").innerText();
    check(!allowed.includes("ERR_SANCTUARY_ZONE"), "unrelated paths do not sanctuary-abort");
    check(allowed.includes("No threats in the last scan"), "unrelated paths do not invent a lab antigen");

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
