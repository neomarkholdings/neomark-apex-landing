import { HardwareToggle } from "./HardwareToggle";
import { DeckPanel, SectionHead } from "./Deck";

interface AmoebaVisualizerProps {
  repairing: boolean;
  autoRepair: boolean;
  onToggle: () => void;
}

export function AmoebaVisualizer({
  repairing,
  autoRepair,
  onToggle,
}: AmoebaVisualizerProps) {
  return (
    <DeckPanel>
      <SectionHead
        en="AMOEBA"
        jp="修復"
        meta={repairing ? "RESTORING" : autoRepair ? "AUTO-REPAIR" : "ASK FIRST"}
      />
      <div className="well mb-3 flex items-center justify-center py-5">
        <div
          className={`amoeba-blob h-20 w-20 ${repairing ? "active" : ""}`}
          aria-label={repairing ? "Restoring files" : "Repair engine idle"}
        />
      </div>
      <HardwareToggle
        checked={autoRepair}
        onToggle={onToggle}
        offLabel="ASK"
        onLabel="AUTO"
      />
      <p className="mt-2 font-readout text-[11px] leading-relaxed text-silver/70">
        Restores infected files from your shadow copies. Never rewrites protected folders.
      </p>
    </DeckPanel>
  );
}
