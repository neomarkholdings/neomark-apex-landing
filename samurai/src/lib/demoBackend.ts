import { isSanctuaryPath, SANCTUARY_ABORT } from "./sanctuary";
import { dueToRearm, rearmDeadline } from "./protection";
import { bandFromScore } from "./types";
import type {
  Antigen,
  AppFlags,
  ImmunityDb,
  Intercept,
  RepairOutcome,
  ScanReport,
  WindowsLineStatus,
} from "./types";

const SELFTEST = "SAMURAI-AMOEBA-ANTIGEN-SELFTEST";

interface DemoMemory {
  flags: AppFlags;
  antigens: Antigen[];
  labPath: string;
  taintedDirty: boolean;
  intercepts: Intercept[];
}

const memory: DemoMemory = {
  flags: {
    amoebaAutoRepair: true,
    streamerMode: false,
    liveWatch: true,
    disarmedUntil: null,
  },
  antigens: [],
  labPath: "/tmp/samurai-lab",
  taintedDirty: true,
  intercepts: [],
};

function maybeRearm(): void {
  const now = Date.now();
  if (dueToRearm(now, memory.flags.liveWatch, memory.flags.disarmedUntil ?? null)) {
    memory.flags.liveWatch = true;
    memory.flags.disarmedUntil = null;
  }
}

function redact(path: string): string {
  if (!memory.flags.streamerMode) {
    return path;
  }
  const name = path.split(/[/\\]/).pop() ?? "redacted";
  return `[STREAM-SHIELD]/${name}`;
}

function shaLike(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 33 + seed.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(16, "0").repeat(4).slice(0, 64);
}

async function pause(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function remediatePath(path: string, confirmed: boolean): RepairOutcome {
  if (isSanctuaryPath(path)) {
    return {
      kind: "sanctuary_abort",
      path: redact(path),
      message: SANCTUARY_ABORT,
    };
  }
  if (!memory.flags.amoebaAutoRepair && !confirmed) {
    return {
      kind: "awaiting_confirmation",
      path: redact(path),
      restorePath: path,
      message:
        "Amoeba held. Antigen is staged; confirm phagocytosis to restore clean state.",
    };
  }
  if (!path.endsWith("tainted.txt") && !path.includes("tainted")) {
    return {
      kind: "failed",
      path: redact(path),
      message: "No localized backup reference or Volume Shadow Copy is available.",
    };
  }
  memory.taintedDirty = false;
  const antigenSha256 = shaLike(`${SELFTEST}:${path}`);
  if (!memory.antigens.some((item) => item.sha256 === antigenSha256)) {
    memory.antigens.push({
      sha256: antigenSha256,
      synthesizedAt: Math.floor(Date.now() / 1000),
      sourcePath: redact(path),
      engine: "heuristic",
    });
  }
  return {
    kind: "repaired",
    path: redact(path),
    message:
      "Amoeba completed phagocytosis and restored the host from shadow stock.",
    antigenSha256,
  };
}

function isDoubleExecName(name: string): boolean {
  const lower = name.toLowerCase();
  const parts = lower.split(".");
  if (parts.length < 3) {
    return false;
  }
  const last = parts[parts.length - 1];
  const middle = parts[parts.length - 2];
  const exec = ["exe", "scr", "bat", "cmd", "js", "vbs", "ps1", "com", "pif", "msi"];
  const bait = [
    "wav",
    "mp3",
    "flac",
    "aiff",
    "aif",
    "m4a",
    "ogg",
    "als",
    "flp",
    "cpr",
    "nki",
    "fst",
    "mid",
    "pdf",
    "zip",
    "docx",
  ];
  return exec.includes(last) && bait.includes(middle);
}

function isRansomNoteName(name: string): boolean {
  const n = name.toLowerCase();
  if (n.endsWith(".wav") || n.endsWith(".mp3") || n.endsWith(".flac")) {
    return false;
  }
  return [
    "how_to_decrypt",
    "howtodecrypt",
    "decrypt_instructions",
    "files_encrypted",
    "recover_your_files",
    "readme_decrypt",
    "ransom",
    "_decrypt_",
  ].some((clue) => n.includes(clue));
}

function hasWarezCrackToken(name: string): boolean {
  const n = name.toLowerCase();
  let from = 0;
  while (from + 5 <= n.length) {
    const rel = n.indexOf("crack", from);
    if (rel < 0) {
      return false;
    }
    const after = n.slice(rel + 5);
    if (after.startsWith("le") || after.startsWith("ling") || after.startsWith("ly")) {
      from = rel + 5;
      continue;
    }
    return true;
  }
  return false;
}

function isWarezName(name: string): boolean {
  const n = name.toLowerCase();
  if (
    /\.(wav|mp3|flac|aiff|aif|m4a|ogg|als|flp)$/.test(n) &&
    !isDoubleExecName(n)
  ) {
    return false;
  }
  return (
    hasWarezCrackToken(n) ||
    ["keygen", "activator", "nulled", "warez", "patcher", "serialz", "codecpack", "codec-pack"].some(
      (clue) => n.includes(clue),
    )
  );
}

function demoInnerNames(path: string): string[] {
  const name = (path.split(/[/\\]/).pop() ?? "").toLowerCase();
  if (name === "ableton_live_12.zip" || name === "fl_studio_20.zip") {
    return ["Setup.exe", "keygen.exe"];
  }
  return [];
}

function archiveReason(inner: string[]): string | null {
  for (const item of inner) {
    const base = item.split(/[/\\]/).pop() ?? item;
    if (isWarezName(base) || isDoubleExecName(base) || isMasqueradeName(base)) {
      return "Archive contains a crack/keygen/activator — common trojan, RAT, or ransomware loader.";
    }
  }
  return null;
}

function holdReasonFromPath(path: string, innerNames?: string[]): string | null {
  const name = path.split(/[/\\]/).pop() ?? "";
  if (isDoubleExecName(name)) {
    return "Double-extension drop: a creation or document name hiding an executable.";
  }
  if (isWarezName(name)) {
    return "Crack/keygen/activator drop — common trojan, RAT, or ransomware loader.";
  }
  if (isMasqueradeName(path)) {
    return "System binary name dropped outside System32 — classic RAT / loader masquerade.";
  }
  if (isRansomNoteName(name)) {
    return "Ransom-note filename in a drop folder.";
  }
  const nested = innerNames && innerNames.length > 0 ? innerNames : demoInnerNames(path);
  return archiveReason(nested);
}

function footholdFromTarget(customTarget: string | null): ScanReport["findings"] {
  if (!customTarget || isSanctuaryPath(customTarget)) {
    return [];
  }
  const reason = holdReasonFromPath(customTarget);
  if (!reason) {
    return [];
  }
  return [
    {
      engine: "foothold",
      detail: reason,
      path: redact(customTarget),
      severity: reason.includes("Ransom-note") ? "high" : "critical",
    },
  ];
}

function isHoldableDetail(detail: string): boolean {
  return (
    detail.includes("Crack/keygen") ||
    detail.includes("Double-extension") ||
    detail.includes("System binary") ||
    detail.includes("Ransom-note") ||
    detail.includes("disguised") ||
    detail.includes("Archive contains")
  );
}

function recordIntercept(path: string, reason: string, sanctuary: boolean): Intercept {
  const name = path.split(/[/\\]/).pop() ?? "drop.bin";
  const intercept: Intercept = sanctuary
    ? {
        originalPath: redact(path),
        holdPath: null,
        reason,
        kind: "sanctuary_alert",
      }
    : {
        originalPath: redact(path),
        holdPath: `[INSTALL-GATE]/${name}`,
        reason,
        kind: "held",
      };
  memory.intercepts = [intercept, ...memory.intercepts].slice(0, 40);
  return intercept;
}

function simulateDrop(path: string, innerNames?: string[]): Intercept | null {
  if (!memory.flags.liveWatch) {
    return null;
  }
  const reason = holdReasonFromPath(path, innerNames);
  if (!reason) {
    return null;
  }
  return recordIntercept(path, reason, isSanctuaryPath(path));
}

function isMasqueradeName(path: string): boolean {
  const name = (path.split(/[/\\]/).pop() ?? "").toLowerCase();
  const joined = path.replace(/\\/g, "/").toLowerCase();
  const masquerade = [
    "svchost.exe",
    "lsass.exe",
    "services.exe",
    "winlogon.exe",
    "csrss.exe",
    "smss.exe",
  ];
  return (
    masquerade.includes(name) &&
    !joined.includes("/windows/system32") &&
    !joined.includes("/windows/syswow64")
  );
}

function buildScan(targetPath?: string | null): ScanReport {
  const lab = memory.labPath;
  const customTarget = targetPath?.trim() ? targetPath.trim() : null;
  const tainted = `${lab}/tainted.txt`;
  const findings = [];
  const autoActions: RepairOutcome[] = [];

  if (customTarget && isSanctuaryPath(customTarget)) {
    autoActions.push({
      kind: "sanctuary_abort",
      path: redact(customTarget),
      message: SANCTUARY_ABORT,
    });
  } else if (!customTarget && memory.taintedDirty) {
    findings.push({
      engine: "heuristic",
      detail: "Self-test antigen string located in host file.",
      path: redact(tainted),
      severity: "critical" as const,
    });
    autoActions.push(remediatePath(tainted, false));
  }

  if (!(customTarget && isSanctuaryPath(customTarget))) {
    findings.push(...footholdFromTarget(customTarget));
  }

  const repaired = autoActions.filter((item) => item.kind === "repaired").length;
  const awaiting = autoActions.filter(
    (item) => item.kind === "awaiting_confirmation",
  ).length;
  const aborted = autoActions.filter((item) => item.kind === "sanctuary_abort").length;
  const footholdOnly =
    findings.length > 0 &&
    findings.every((item) => item.engine === "foothold") &&
    repaired === 0 &&
    awaiting === 0 &&
    aborted === 0;
  let threatScore = findings.length === 0 ? 4 : 78;
  if (aborted > 0) {
    threatScore = 0;
  } else if (repaired > 0 && awaiting === 0) {
    threatScore = 12;
  } else if (awaiting > 0) {
    threatScore = 64;
  } else if (footholdOnly) {
    threatScore = findings.some((item) => item.severity === "critical") ? 72 : 48;
  }

  const band = bandFromScore(threatScore);
  const synthesis = (() => {
    if (aborted > 0) {
      return "Sanctuary sector locked; Samurai will not rewrite, quarantine, or restore inside the creations vault.";
    }
    if (footholdOnly) {
      return "Foothold hunt flagged a creator-targeted drop. Inspect the table; Samurai will not rewrite sanctuary.";
    }
    if (threatScore <= 5 && findings.length === 0) {
      return "Chassis is sterile; Samurai reports no antigenic residue on this sweep.";
    }
    if (repaired > 0) {
      return "Amoeba ingested the anomaly and restored the host file from localized shadow stock.";
    }
    if (awaiting > 0) {
      return "Caution band: antigen traces are staged and Amoeba awaits explicit confirmation.";
    }
    if (threatScore <= 30) {
      return "Low-grade noise only; the silver line holds and no phagocytosis is required.";
    }
    return "Critical incursion on the blood-red band; confirm phagocytosis to restore clean state.";
  })();

  const intercepts: Intercept[] = [];
  if (memory.flags.liveWatch && aborted === 0) {
    for (const finding of findings) {
      if (finding.engine !== "foothold" || !finding.path || !isHoldableDetail(finding.detail)) {
        continue;
      }
      const name = finding.path.split(/[/\\]/).pop() ?? "drop.bin";
      intercepts.push({
        originalPath: finding.path,
        holdPath: `[INSTALL-GATE]/${name}`,
        reason: finding.detail,
        kind: "held",
      });
    }
  }
  if (intercepts.length > 0) {
    memory.intercepts = [...intercepts, ...memory.intercepts].slice(0, 40);
  }

  const sentence = memory.flags.streamerMode
    ? `${(intercepts.length > 0
        ? "Install gate held a high-risk drop before it could run. Creations were not rewritten."
        : synthesis
      ).replace(/\.$/, "")}, with streamer shield masking path readout.`
    : intercepts.length > 0
      ? "Install gate held a high-risk drop before it could run. Creations were not rewritten."
      : synthesis;

  return {
    threatScore,
    synthesis: sentence,
    band,
    findings,
    engineStatuses: [
      {
        name: "heuristic",
        available: true,
        summary: "Inspected 6 file(s).",
      },
      {
        name: "foothold",
        available: true,
        summary:
          findings.filter((item) => item.engine === "foothold").length > 0
            ? `${findings.filter((item) => item.engine === "foothold").length} creator-threat or persistence hit(s).`
            : "Creator-threat hunt: disguised payloads, ransom notes, hostile autostart.",
      },
      {
        name: "gate",
        available: memory.flags.liveWatch,
        summary:
          intercepts.length > 0
            ? `${intercepts.length} drop(s) moved to the install-gate vault.`
            : memory.flags.liveWatch
              ? "Install gate armed: crack/keygen/RAT drops are held on write. Nested archives are inspected."
              : "Install gate standby.",
      },
      {
        name: "yara",
        available: false,
        summary: "YARA binary not present on PATH.",
      },
      {
        name: "clamav",
        available: false,
        summary: "clamscan binary not present on PATH.",
      },
      {
        name: "tshark",
        available: false,
        summary: memory.flags.streamerMode
          ? "Streamer shield suppressed packet telemetry."
          : "tshark binary not present on PATH.",
      },
    ],
    autoActions,
    streamerMode: memory.flags.streamerMode,
    scannedFiles: 6,
    labPath: lab,
    intercepts,
  };
}

function previewWindowsLine(): WindowsLineStatus {
  return {
    host: "preview",
    defenderRealtime: null,
    exclusionsAligned: false,
    paths: [],
    processes: ["samurai.exe", "yara.exe", "clamscan.exe", "freshclam.exe"],
    summary:
      "Windows Defender line is idle on this host. On Windows, ALIGN asks Defender to skip only Samurai folders — never Downloads, never Desktop. Real-time protection stays on.",
  };
}

export async function demoInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  maybeRearm();
  switch (cmd) {
    case "get_app_state":
      return { ...memory.flags } as T;
    case "toggle_amoeba_auto_repair":
      memory.flags.amoebaAutoRepair = !memory.flags.amoebaAutoRepair;
      return memory.flags.amoebaAutoRepair as T;
    case "toggle_streamer_mode":
      memory.flags.streamerMode = !memory.flags.streamerMode;
      return memory.flags.streamerMode as T;
    case "toggle_live_watch": {
      memory.flags.liveWatch = !memory.flags.liveWatch;
      memory.flags.disarmedUntil = rearmDeadline(
        Date.now(),
        memory.flags.liveWatch,
      );
      return memory.flags.liveWatch as T;
    }
    case "get_intercepts":
      return memory.intercepts as T;
    case "simulate_drop": {
      const path = String(args?.path ?? "");
      const innerNames = Array.isArray(args?.innerNames)
        ? (args.innerNames as string[])
        : undefined;
      return simulateDrop(path, innerNames) as T;
    }
    case "release_intercept": {
      const holdPath = String(args?.holdPath ?? "");
      const originalPath = String(args?.originalPath ?? "");
      if (isSanctuaryPath(originalPath)) {
        throw new Error(SANCTUARY_ABORT);
      }
      const matchCount = memory.intercepts.filter(
        (item) => item.holdPath === holdPath || item.originalPath === originalPath,
      ).length;
      if (matchCount === 0) {
        throw new Error("held drop is no longer in the install-gate vault");
      }
      memory.intercepts = memory.intercepts.filter(
        (item) => item.holdPath !== holdPath && item.originalPath !== originalPath,
      );
      return originalPath as T;
    }
    case "seed_demo_lab":
      memory.taintedDirty = true;
      memory.antigens = [];
      memory.intercepts = [];
      memory.flags.liveWatch = true;
      memory.flags.disarmedUntil = null;
      return memory.labPath as T;
    case "get_windows_line":
      return previewWindowsLine() as T;
    case "align_windows_line":
      return previewWindowsLine().summary as T;
    case "get_immunity_log":
      return {
        version: 1,
        antigens: memory.antigens.map((item) => ({
          ...item,
          sourcePath: memory.flags.streamerMode
            ? "[STREAM-SHIELD]"
            : item.sourcePath,
        })),
      } satisfies ImmunityDb as T;
    case "run_samurai_scan": {
      await pause(900);
      const target =
        typeof args?.targetPath === "string" ? args.targetPath : null;
      return buildScan(target) as T;
    }
    case "amoeba_remediate": {
      await pause(420);
      const path = String(args?.path ?? "");
      const confirmed = Boolean(args?.confirmed);
      return remediatePath(path, confirmed) as T;
    }
    default:
      throw new Error(`Unknown demo command: ${cmd}`);
  }
}
