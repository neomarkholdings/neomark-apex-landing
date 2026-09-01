import { HardwareToggle } from "./HardwareToggle";
import { Led } from "./HardwareBits";

interface StreamerPanelProps {
  streamerMode: boolean;
  onToggle: () => void;
}

export function StreamerPanel({ streamerMode, onToggle }: StreamerPanelProps) {
  return (
    <section className="panel-metal panel-pod-alt relative flex h-full flex-col p-4">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-display text-[11px] tracking-[0.22em] text-silver">
            STREAMER // ストリーマー
          </p>
          <p className="mt-1 font-readout text-[10px] tracking-[0.16em] text-silver/70">
            OVERLAY GUARD
          </p>
        </div>
        <Led on={streamerMode} />
      </header>
      <div className="crt-well mb-4 flex flex-1 flex-col justify-center rounded-[28px] px-4 py-5">
        <p className="font-display text-[10px] tracking-[0.22em] text-silver/80">
          {streamerMode ? "ACTIVE STREAMER SHIELD" : "STANDARD MONITORING"}
        </p>
        <p className="mt-3 font-readout text-[12px] leading-relaxed text-chrome/90">
          {streamerMode
            ? "Path names stay off the overlay. Packet sampling is muted so a live scene never leaks your folders."
            : "Full path synthesis is live. Flip the shield before you go live."}
        </p>
      </div>
      <HardwareToggle
        checked={streamerMode}
        onToggle={onToggle}
        offLabel="MONITOR"
        offKana="監視"
        onLabel="SHIELD"
        onKana="シールド"
      />
    </section>
  );
}
