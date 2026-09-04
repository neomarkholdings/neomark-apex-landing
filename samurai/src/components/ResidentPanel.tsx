import { HardwareToggle } from "./HardwareToggle";
import { DeckPanel, SectionHead } from "./Deck";
import type { ResidentStatus } from "../lib/types";

interface ResidentPanelProps {
  status: ResidentStatus | null;
  onToggleAutostart: () => void;
  onSit: () => void;
}

export function ResidentPanel({
  status,
  onToggleAutostart,
  onSit,
}: ResidentPanelProps) {
  const desktop = status?.tray ?? false;
  const autostart = status?.autostart ?? false;
  return (
    <DeckPanel>
      <SectionHead
        en="RESIDENT"
        jp="常駐"
        meta={autostart ? "AT BOOT" : desktop ? "TRAY" : "PREVIEW"}
      />
      <p className="mb-3 font-readout text-[12px] leading-relaxed text-silver/80">
        {status?.summary ??
          "Sits in the tray. Holds do not pop the console, toast, or steal focus. Click the tray when you are ready."}
      </p>
      <HardwareToggle
        checked={autostart}
        onToggle={onToggleAutostart}
        offLabel="SESSION"
        onLabel="AT BOOT"
        ariaLabel="Start at boot"
      />
      <button
        type="button"
        onClick={onSit}
        className="hardware-btn mt-3 w-full rounded-[10px] px-4 py-2.5 font-display text-[11px] tracking-[0.16em]"
      >
        SIT
      </button>
    </DeckPanel>
  );
}
