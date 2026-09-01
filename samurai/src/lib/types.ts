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
}

export interface AppFlags {
  amoebaAutoRepair: boolean;
  streamerMode: boolean;
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
      return "NOMINAL // 正常";
    case "caution":
      return "CAUTION // 注意";
    case "critical":
      return "CRITICAL // 危機";
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
