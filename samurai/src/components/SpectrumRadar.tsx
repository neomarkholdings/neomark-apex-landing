interface SpectrumRadarProps {
  score: number;
  scanning: boolean;
}

export function SpectrumRadar({ score, scanning }: SpectrumRadarProps) {
  const bars = Array.from({ length: 32 }, (_, i) => i);
  const activity = Math.max(0.18, score / 100);

  return (
    <section className="panel-metal panel-pod px-5 py-4">
      <header className="mb-3 flex items-center justify-between">
        <p className="font-display text-[11px] tracking-[0.32em] text-silver">
          SPECTRUM RADAR // スペクトル
        </p>
        <p className="font-readout text-[10px] tracking-[0.22em] text-silver/70">
          {scanning ? "SWEEP LIVE" : "TELEMETRY HOLD"}
        </p>
      </header>
      <div className="crt-well flex h-28 items-end gap-[3px] overflow-hidden rounded-xl px-3 py-2">
        {bars.map((bar) => {
          const wave = 0.35 + Math.abs(Math.sin(bar * 0.55)) * activity;
          const delay = `${(bar * 0.07).toFixed(2)}s`;
          const duration = scanning ? "0.55s" : `${(0.9 + (bar % 5) * 0.12).toFixed(2)}s`;
          return (
            <span
              key={bar}
              className="spectrum-bar w-full rounded-t-[2px]"
              style={{
                height: `${Math.round(wave * 100)}%`,
                animationDuration: duration,
                animationDelay: delay,
                opacity: 0.45 + activity * 0.55,
              }}
            />
          );
        })}
      </div>
    </section>
  );
}
