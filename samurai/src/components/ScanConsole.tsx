import { repairKindLabel } from "../lib/types";
import type { EngineStatus, Finding, Intercept, RepairOutcome, Severity } from "../lib/types";
import { DeckPanel, SectionHead } from "./Deck";
import { Led } from "./HardwareBits";

interface ScanConsoleProps {
  path: string;
  onPathChange: (value: string) => void;
  onBrowse: () => void;
  onScan: () => void;
  onRestore: () => void;
  scanning: boolean;
  pending: RepairOutcome | null;
  findings: Finding[];
  actions: RepairOutcome[];
  engines: EngineStatus[];
  scannedFiles: number;
  hasScanned: boolean;
  intercepts: Intercept[];
}

function actionForFinding(
  finding: Finding,
  actions: RepairOutcome[],
): RepairOutcome | null {
  const name = finding.path?.split(/[/\\]/).pop();
  if (!finding.path) {
    return null;
  }
  return (
    actions.find((item) => {
      if (item.path === finding.path) {
        return true;
      }
      return Boolean(name && item.path.endsWith(name));
    }) ?? null
  );
}

function engineTone(status: EngineStatus): string {
  return status.available ? "text-chrome" : "text-silver/40";
}

function severityClass(severity: Severity): string {
  switch (severity) {
    case "low":
      return "sev-low";
    case "medium":
      return "sev-medium";
    case "high":
      return "sev-high";
    case "critical":
      return "sev-critical";
    default: {
      const exhaustive: never = severity;
      return exhaustive;
    }
  }
}

export function ScanConsole({
  path,
  onPathChange,
  onBrowse,
  onScan,
  onRestore,
  scanning,
  pending,
  findings,
  actions,
  engines,
  scannedFiles,
  hasScanned,
  intercepts,
}: ScanConsoleProps) {
  const canRestore = pending?.kind === "awaiting_confirmation";

  return (
    <DeckPanel className="h-full">
      <SectionHead
        en="SCAN"
        jp="検査"
        meta={scanning ? "RUNNING" : `${scannedFiles} FILES`}
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {engines.map((engine) => (
          <span
            key={engine.name}
            title={engine.summary}
            className={`engine-chip font-readout text-[10px] tracking-[0.12em] ${engineTone(engine)} ${
              engine.available ? "live" : ""
            }`}
          >
            <Led on={engine.available} silver={!engine.available} />
            {engine.name.toUpperCase()}
            {engine.available ? " ON" : " OFF"}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block font-display text-[9px] tracking-[0.2em] text-silver/70">
            FOLDER TO SCAN
          </span>
          <input
            value={path}
            onChange={(event) => onPathChange(event.target.value)}
            placeholder="Leave blank to scan the built-in test folder"
            className="lcd-face w-full rounded-[10px] px-3 py-2.5 font-readout text-sm outline-none"
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={onBrowse}
            disabled={scanning}
            className="hardware-btn min-w-[108px] rounded-[10px] px-4 py-2.5 font-display text-[11px] tracking-[0.16em]"
          >
            BROWSE
          </button>
          <button
            type="button"
            onClick={onScan}
            disabled={scanning}
            className={`hardware-btn min-w-[108px] rounded-[10px] px-4 py-2.5 font-display text-[11px] tracking-[0.16em] ${
              scanning ? "pressed armed" : "armed"
            }`}
          >
            {scanning ? "SCANNING" : "SCAN"}
          </button>
          <button
            type="button"
            onClick={onRestore}
            disabled={!canRestore}
            className="hardware-btn min-w-[108px] rounded-[10px] px-4 py-2.5 font-display text-[11px] tracking-[0.16em]"
          >
            RESTORE
          </button>
        </div>
      </div>

      {scanning ? (
        <div className="well mt-3 h-2 overflow-hidden">
          <div className="progress-fill indeterminate" />
        </div>
      ) : null}

      {pending ? (
        <div
          className={`lcd-face mt-3 rounded-[10px] px-3 py-2.5 ${
            pending.kind === "sanctuary_abort" || pending.kind === "failed"
              ? "critical"
              : ""
          }`}
        >
          <p className="relative font-display text-[9px] tracking-[0.18em]">
            {repairKindLabel(pending.kind)} · {pending.path}
          </p>
          <p className="relative mt-1 font-readout text-[13px]">{pending.message}</p>
        </div>
      ) : null}

      {intercepts.length > 0 ? (
        <div className="lcd-face critical mt-3 rounded-[10px] px-3 py-2.5">
          <p className="relative font-display text-[9px] tracking-[0.18em]">
            INSTALL GATE · {intercepts[0].kind.toUpperCase()} ·{" "}
            {intercepts[0].originalPath}
          </p>
          <p className="relative mt-1 font-readout text-[13px]">{intercepts[0].reason}</p>
        </div>
      ) : null}

      <div className="well mt-3 flex-1">
        <div className="threat-row head font-display text-[9px] tracking-[0.16em] text-silver/50">
          <span>FILE</span>
          <span>ENGINE</span>
          <span>SEVERITY</span>
          <span>ACTION</span>
        </div>
        {findings.length === 0 ? (
          <div className="empty-sweep">
            <span className="empty-mark">侍</span>
            <p className="font-readout text-sm text-silver/70">
              {hasScanned
                ? "No threats in the last scan. Your files were not modified."
                : "Ready to inspect a folder. Samurai will not rewrite your creations."}
            </p>
            <p className="font-display text-[9px] tracking-[0.28em] text-silver/35">
              {hasScanned ? "CLEAN SWEEP" : "STANDBY"}
            </p>
          </div>
        ) : (
          findings.map((finding, index) => {
            const action = actionForFinding(finding, actions);
            return (
              <div
                key={`${finding.engine}-${finding.path ?? "n"}-${index}`}
                className="threat-row"
              >
                <div className="min-w-0">
                  <p className="truncate font-readout text-[13px] text-chrome">
                    {finding.path ?? "Network sample"}
                  </p>
                  <p className="truncate font-readout text-[11px] text-silver/55">
                    {finding.detail}
                  </p>
                </div>
                <p className="font-readout text-[11px] uppercase text-silver/80">
                  {finding.engine}
                </p>
                <p
                  className={`font-readout text-[11px] uppercase ${severityClass(finding.severity)}`}
                >
                  <span className="sev-pip" />
                  {finding.severity}
                </p>
                <p className="font-readout text-[11px] uppercase text-silver/80">
                  {intercepts.some(
                    (item) =>
                      item.kind === "held" &&
                      (item.originalPath === finding.path ||
                        (finding.path &&
                          item.originalPath.endsWith(
                            finding.path.split(/[/\\]/).pop() ?? "",
                          ))),
                  )
                    ? "HELD"
                    : action
                      ? repairKindLabel(action.kind)
                      : "DETECTED"}
                </p>
              </div>
            );
          })
        )}
      </div>
    </DeckPanel>
  );
}
