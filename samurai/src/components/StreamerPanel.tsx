import { HardwareToggle } from "./HardwareToggle";
import { DeckPanel, SectionHead } from "./Deck";

interface StreamerPanelProps {
  streamerMode: boolean;
  onToggle: () => void;
}

export function StreamerPanel({ streamerMode, onToggle }: StreamerPanelProps) {
  return (
    <DeckPanel>
      <SectionHead
        en="PRIVACY"
        jp="遮蔽"
        meta={streamerMode ? "ON AIR" : "OFF"}
      />
      {streamerMode ? (
        <div className="lcd-face critical mb-3 rounded-[10px] px-3 py-2">
          <p className="relative font-display text-[10px] tracking-[0.22em]">
            ON AIR · PATHS REDACTED
          </p>
        </div>
      ) : null}
      <p className="mb-3 font-readout text-[12px] leading-relaxed text-silver/80">
        {streamerMode
          ? "Folder names are hidden and network capture is paused while you stream."
          : "Full paths are visible. Turn this on before going live."}
      </p>
      <HardwareToggle
        checked={streamerMode}
        onToggle={onToggle}
        offLabel="SHOW PATHS"
        onLabel="HIDE PATHS"
      />
    </DeckPanel>
  );
}
