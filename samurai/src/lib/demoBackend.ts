import { isSanctuaryPath, SANCTUARY_ABORT } from "./sanctuary";
import { bandFromScore } from "./types";
import type {
  Antigen,
  AppFlags,
  ImmunityDb,
  RepairOutcome,
  ScanReport,
} from "./types";

const SELFTEST = "SAMURAI-AMOEBA-ANTIGEN-SELFTEST";

interface DemoMemory {
  flags: AppFlags;
  antigens: Antigen[];
  labPath: string;
  taintedDirty: boolean;
}

const memory: DemoMemory = {
  flags: {
    amoebaAutoRepair: true,
    streamerMode: false,
  },
  antigens: [],
  labPath: "/tmp/samurai-lab",
  taintedDirty: true,
};

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
    window.setTimeout(resolve, ms);
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
  } else if (!customTarget) {
    memory.taintedDirty = true;
    findings.push({
      engine: "heuristic",
      detail: "Self-test antigen string located in host file.",
      path: redact(tainted),
      severity: "critical" as const,
    });
    autoActions.push(remediatePath(tainted, false));
  }

  const repaired = autoActions.filter((item) => item.kind === "repaired").length;
  const awaiting = autoActions.filter(
    (item) => item.kind === "awaiting_confirmation",
  ).length;
  const aborted = autoActions.filter((item) => item.kind === "sanctuary_abort").length;
  let threatScore = findings.length === 0 ? 4 : 78;
  if (aborted > 0) {
    threatScore = 0;
  } else if (repaired > 0 && awaiting === 0) {
    threatScore = 12;
  } else if (awaiting > 0) {
    threatScore = 64;
  }

  const band = bandFromScore(threatScore);
  const synthesis = (() => {
    if (aborted > 0) {
      return "Sanctuary sector locked; Samurai will not rewrite, quarantine, or restore inside the creations vault.";
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

  const sentence = memory.flags.streamerMode
    ? `${synthesis.replace(/\.$/, "")}, with streamer shield masking path readout.`
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
  };
}

export async function demoInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  switch (cmd) {
    case "get_app_state":
      return { ...memory.flags } as T;
    case "toggle_amoeba_auto_repair":
      memory.flags.amoebaAutoRepair = !memory.flags.amoebaAutoRepair;
      return memory.flags.amoebaAutoRepair as T;
    case "toggle_streamer_mode":
      memory.flags.streamerMode = !memory.flags.streamerMode;
      return memory.flags.streamerMode as T;
    case "seed_demo_lab":
      memory.taintedDirty = true;
      memory.antigens = [];
      return memory.labPath as T;
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
