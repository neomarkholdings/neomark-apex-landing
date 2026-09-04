export type ThreatBand = "nominal" | "caution" | "critical";
export type Severity = "low" | "medium" | "high" | "critical";

export interface Finding {
  engine: string;
  detail: string;
  path?: string | null;
  severity: Severity;
}

export interface EngineStatus {
  name: string;
  available: boolean;
  summary: string;
}

export type RepairOutcome =
  | {
      kind: "repaired";
      path: string;
      message: string;
      antigenSha256: string;
    }
  | {
      kind: "awaiting_confirmation";
      path: string;
      message: string;
      restorePath: string;
    }
  | {
      kind: "sanctuary_abort";
      path: string;
      message: string;
    }
  | {
      kind: "failed";
      path: string;
      message: string;
    };

export interface ScanReport {
  threatScore: number;
  synthesis: string;
  band: ThreatBand;
  findings: Finding[];
  engineStatuses: EngineStatus[];
  autoActions: RepairOutcome[];
  streamerMode: boolean;
  scannedFiles: number;
  labPath?: string | null;
  intercepts?: Intercept[];
}

export interface Intercept {
  originalPath: string;
  holdPath?: string | null;
  reason: string;
  kind: "held" | "sanctuary_alert" | string;
}

export interface WindowsLineStatus {
  host: string;
  defenderRealtime?: boolean | null;
  exclusionsAligned: boolean;
  paths: string[];
  processes: string[];
  summary: string;
}

export interface ResidentStatus {
  host: string;
  tray: boolean;
  autostart: boolean;
  silent?: boolean;
  summary: string;
}

export interface AppFlags {
  amoebaAutoRepair: boolean;
  streamerMode: boolean;
  liveWatch: boolean;
  disarmedUntil?: number | null;
}

export interface Antigen {
  sha256: string;
  synthesizedAt: number;
  sourcePath: string;
  engine: string;
}

export interface ImmunityDb {
  version: number;
  antigens: Antigen[];
}

export function bandFromScore(score: number): ThreatBand {
  if (score <= 30) {
    return "nominal";
  }
  if (score <= 70) {
    return "caution";
  }
  return "critical";
}

export function bandLabel(band: ThreatBand): string {
  switch (band) {
    case "nominal":
      return "PROTECTED";
    case "caution":
      return "AT RISK";
    case "critical":
      return "INFECTED";
    default: {
      const exhaustive: never = band;
      return exhaustive;
    }
  }
}

export function repairKindLabel(kind: RepairOutcome["kind"]): string {
  switch (kind) {
    case "repaired":
      return "RESTORED";
    case "awaiting_confirmation":
      return "AWAITING";
    case "sanctuary_abort":
      return "SANCTUARY";
    case "failed":
      return "FAILED";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}
