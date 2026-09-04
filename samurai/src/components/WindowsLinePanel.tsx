import { DeckPanel, SectionHead } from "./Deck";
import type { WindowsLineStatus } from "../lib/types";

interface WindowsLinePanelProps {
  status: WindowsLineStatus | null;
  aligning: boolean;
  onAlign: () => void;
}

export function WindowsLinePanel({
  status,
  aligning,
  onAlign,
}: WindowsLinePanelProps) {
  const meta = status?.exclusionsAligned
    ? "ALIGNED"
    : status?.host === "windows"
      ? "NEEDED"
      : "STANDBY";
  const realtime = status?.defenderRealtime;
  return (
    <DeckPanel>
      <SectionHead en="WINDOWS LINE" jp="窓" meta={meta} />
      {realtime === false ? (
        <div className="lcd-face critical mb-3 rounded-[10px] px-3 py-2">
          <p className="relative font-display text-[10px] tracking-[0.22em]">
            DEFENDER REAL-TIME OFF
          </p>
          <p className="relative mt-1 font-readout text-[12px]">
            Samurai will not disable Windows Defender, and will not turn it
            back on. Enable real-time protection in Windows Security.
          </p>
        </div>
      ) : (
        <p className="mb-3 font-readout text-[12px] leading-relaxed text-silver/80">
          {status?.summary ??
            "Defender stays armed. ALIGN asks it to skip only Samurai folders and the hold vault — never Downloads or Desktop."}
        </p>
      )}
      <button
        type="button"
        onClick={onAlign}
        disabled={aligning}
        className="hardware-btn w-full rounded-[10px] px-4 py-2.5 font-display text-[11px] tracking-[0.16em]"
      >
        {aligning ? "ALIGNING" : "ALIGN"}
      </button>
    </DeckPanel>
  );
}
