import { HardwareToggle } from "./HardwareToggle";

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
    <section className="panel-metal panel-pod relative flex h-full flex-col p-4">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-display text-[11px] tracking-[0.32em] text-silver">
            AMOEBA // アメーバ
          </p>
          <p className="mt-1 font-readout text-[10px] tracking-[0.16em] text-silver/70">
            RECOVERY CORE
          </p>
        </div>
        <span
          className={`font-readout text-[10px] tracking-[0.2em] ${
            repairing ? "text-blood-hot" : "text-silver/70"
          }`}
        >
          {repairing ? "RESTORING" : autoRepair ? "AUTONOMOUS" : "STANDBY"}
        </span>
      </header>
      <div className="crt-well relative mb-4 flex flex-1 items-center justify-center overflow-hidden rounded-[28px] py-6">
        <span className="chrome-tube left-[-10%] top-[28%] w-[38%] rotate-[-18deg]" />
        <span className="chrome-tube right-[-8%] top-[46%] w-[34%] rotate-[22deg]" />
        <span className="chrome-tube bottom-[18%] left-[12%] w-[28%] rotate-[8deg]" />
        <div
          className={`amoeba-blob relative z-[1] h-36 w-36 ${repairing ? "active" : ""}`}
          aria-label={repairing ? "Amoeba restoring" : "Amoeba idle"}
        />
      </div>
      <HardwareToggle
        checked={autoRepair}
        onToggle={onToggle}
        offLabel="PROMPT"
        offKana="手動"
        onLabel="AUTO"
        onKana="自動"
      />
      <p className="mt-3 font-readout text-[10px] leading-relaxed tracking-wide text-silver/65">
        {autoRepair
          ? "Amoeba restores infected hosts from .amoeba_shadow / Volume Shadow Copies. Creative sanctuary files are never touched."
          : "Prompt on detection. Restore waits for you — your mixes, VODs, and project files stay sealed."}
      </p>
    </section>
  );
}
