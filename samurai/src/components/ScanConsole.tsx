import { repairKindLabel } from "../lib/types";
import type { EngineStatus, Finding, RepairOutcome } from "../lib/types";
import { DeckPanel, SectionHead } from "./Deck";

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
            className={`rounded-full border border-white/10 px-2.5 py-1 font-readout text-[10px] tracking-[0.12em] ${engineTone(engine)}`}
          >
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

      <div className="well mt-3 flex-1">
        <div className="threat-row font-display text-[9px] tracking-[0.16em] text-silver/50">
          <span>FILE</span>
          <span>ENGINE</span>
          <span>SEVERITY</span>
          <span>ACTION</span>
        </div>
        {findings.length === 0 ? (
          <p className="px-3 py-8 text-center font-readout text-sm text-silver/55">
            No threats in the last scan. Your files were not modified.
          </p>
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
                <p className="font-readout text-[11px] uppercase text-blood-hot">
                  {finding.severity}
                </p>
                <p className="font-readout text-[11px] uppercase text-silver/80">
                  {action ? repairKindLabel(action.kind) : "DETECTED"}
                </p>
              </div>
            );
          })
        )}
      </div>
    </DeckPanel>
  );
}
