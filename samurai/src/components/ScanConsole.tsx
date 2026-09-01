import { repairKindLabel } from "../lib/types";
import type { EngineStatus, Finding, RepairOutcome } from "../lib/types";

interface ScanConsoleProps {
  path: string;
  onPathChange: (value: string) => void;
  pending: RepairOutcome | null;
  findings: Finding[];
  engines: EngineStatus[];
  labPath?: string | null;
}

function engineTone(status: EngineStatus): string {
  if (!status.available) {
    return "text-silver/40";
  }
  if (status.summary.toLowerCase().includes("0 ")) {
    return "text-chrome";
  }
  return "text-blood-hot";
}

export function ScanConsole({
  path,
  onPathChange,
  pending,
  findings,
  engines,
  labPath,
}: ScanConsoleProps) {
  return (
    <section className="panel-metal panel-pod p-5">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-[11px] tracking-[0.32em] text-silver">
            SCAN // スキャン
          </p>
          <p className="mt-1 max-w-xl font-readout text-[10px] leading-relaxed text-silver/65">
            Samurai inspects the host. It does not rewrite your art. Leave the
            path blank to arm the local self-test lab
            {labPath ? ` (${labPath})` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {engines.map((engine) => (
            <span
              key={engine.name}
              className={`rounded-full border border-white/10 px-3 py-1 font-readout text-[10px] tracking-[0.16em] ${engineTone(engine)}`}
              title={engine.summary}
            >
              {engine.name.toUpperCase()}
            </span>
          ))}
        </div>
      </header>

      <label className="block">
        <span className="mb-1 block font-display text-[9px] tracking-[0.28em] text-silver/70">
          TARGET PATH
        </span>
        <input
          value={path}
          onChange={(event) => onPathChange(event.target.value)}
          placeholder="scan a folder, or leave blank for the sealed lab"
          className="lcd-face w-full rounded-lg px-3 py-3 font-readout text-sm outline-none ring-0"
        />
      </label>

      {pending ? (
        <div className="lcd-face critical mt-4 rounded-xl px-4 py-3">
          <p className="font-display text-[9px] tracking-[0.28em]">
            {repairKindLabel(pending.kind)} // {pending.path}
          </p>
          <p className="mt-1 font-readout text-sm">{pending.message}</p>
        </div>
      ) : null}

      <ul className="mt-4 grid gap-2 md:grid-cols-2">
        {findings.length === 0 ? (
          <li className="panel-inset rounded-xl px-4 py-3 font-readout text-xs text-silver/60">
            No antigens on the current readout. Your creations stay untouched.
          </li>
        ) : (
          findings.map((finding, index) => (
            <li
              key={`${finding.engine}-${finding.path ?? "n"}-${index}`}
              className="panel-inset rounded-xl px-4 py-3"
            >
              <p className="font-display text-[9px] tracking-[0.24em] text-blood-hot">
                {finding.engine.toUpperCase()} · {finding.severity.toUpperCase()}
              </p>
              <p className="mt-1 font-readout text-xs text-chrome">{finding.detail}</p>
              {finding.path ? (
                <p className="mt-1 truncate font-readout text-[11px] text-silver/60">
                  {finding.path}
                </p>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
