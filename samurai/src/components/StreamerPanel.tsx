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
