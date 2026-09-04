import { HardwareToggle } from "./HardwareToggle";
import { DeckPanel, SectionHead } from "./Deck";
import type { Intercept } from "../lib/types";

interface InstallGatePanelProps {
  liveWatch: boolean;
  intercepts: Intercept[];
  rearmClock?: string | null;
  onToggle: () => void;
  onRelease: () => void;
}

export function InstallGatePanel({
  liveWatch,
  intercepts,
  rearmClock,
  onToggle,
  onRelease,
}: InstallGatePanelProps) {
  const latest = intercepts[0];
  const canRelease = latest?.kind === "held" && Boolean(latest.holdPath);
  return (
    <DeckPanel>
      <SectionHead
        en="INSTALL GATE"
        jp="門"
        meta={
          liveWatch
            ? "ARMED"
            : rearmClock
              ? `STANDBY · ${rearmClock}`
              : "STANDBY"
        }
      />
      {latest ? (
        <div className="lcd-face critical mb-3 rounded-[10px] px-3 py-2">
          <p className="relative font-display text-[10px] tracking-[0.22em]">
            {latest.kind === "held" ? "HELD" : "ALERT"} ·{" "}
            {(latest.originalPath.split(/[/\\]/).pop() ?? latest.originalPath).toUpperCase()}
          </p>
          <p className="relative mt-1 font-readout text-[12px]">{latest.reason}</p>
        </div>
      ) : (
        <p className="mb-3 font-readout text-[12px] leading-relaxed text-silver/80">
          {liveWatch
            ? "On-write watch is armed on Downloads and Desktop. Named cracks, nested keygens inside DAW zips, and disguised drops are held before they can run."
            : "Holds are paused. Sanctuary stays locked. New drops will not be moved to the vault until protection re-arms."}
        </p>
      )}
      <HardwareToggle
        checked={liveWatch}
        onToggle={onToggle}
        offLabel="STANDBY"
        onLabel="ARMED"
      />
      <button
        type="button"
        onClick={onRelease}
        disabled={!canRelease}
        className="hardware-btn mt-3 w-full rounded-[10px] px-4 py-2.5 font-display text-[11px] tracking-[0.16em]"
      >
        RELEASE
      </button>
    </DeckPanel>
  );
}
