import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { demoInvoke } from "./demoBackend";
import type { AppFlags, ImmunityDb, Intercept, RepairOutcome, ScanReport } from "./types";

export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function callCommand<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (isDesktopApp()) {
    return invoke<T>(cmd, args);
  }
  return demoInvoke<T>(cmd, args);
}

export function getAppState(): Promise<AppFlags> {
  return callCommand<AppFlags>("get_app_state");
}

export function toggleAmoebaAutoRepair(): Promise<boolean> {
  return callCommand<boolean>("toggle_amoeba_auto_repair");
}

export function toggleStreamerMode(): Promise<boolean> {
  return callCommand<boolean>("toggle_streamer_mode");
}

export function toggleLiveWatch(): Promise<boolean> {
  return callCommand<boolean>("toggle_live_watch");
}

export function getIntercepts(): Promise<Intercept[]> {
  return callCommand<Intercept[]>("get_intercepts");
}

export function runSamuraiScan(targetPath?: string): Promise<ScanReport> {
  return callCommand<ScanReport>("run_samurai_scan", {
    targetPath: targetPath?.trim() ? targetPath.trim() : null,
  });
}

export function amoebaRemediate(
  path: string,
  confirmed: boolean,
): Promise<RepairOutcome> {
  return callCommand<RepairOutcome>("amoeba_remediate", { path, confirmed });
}

export function getImmunityLog(): Promise<ImmunityDb> {
  return callCommand<ImmunityDb>("get_immunity_log");
}

export function seedDemoLab(): Promise<string> {
  return callCommand<string>("seed_demo_lab");
}

export async function pickScanFolder(): Promise<string | null> {
  if (!isDesktopApp()) {
    return null;
  }
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Samurai — folder to scan",
  });
  if (typeof selected === "string" && selected.trim()) {
    return selected;
  }
  return null;
}
