import { invoke } from "@tauri-apps/api/core";
import { demoInvoke } from "./demoBackend";
import type { AppFlags, ImmunityDb, RepairOutcome, ScanReport } from "./types";

function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window
  );
}

async function callCommand<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (isTauriRuntime()) {
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
