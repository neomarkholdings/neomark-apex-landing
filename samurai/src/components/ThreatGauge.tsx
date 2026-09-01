import { bandLabel } from "../lib/types";
import type { ThreatBand } from "../lib/types";

interface ThreatGaugeProps {
  score: number;
  band: ThreatBand;
  synthesis: string;
  scanning: boolean;
}

function glowForBand(band: ThreatBand): string {
  switch (band) {
    case "nominal":
      return "rgba(197, 205, 214, 0.55)";
    case "caution":
      return "rgba(240, 196, 203, 0.55)";
    case "critical":
      return "rgba(255, 26, 75, 0.8)";
    default: {
      const exhaustive: never = band;
      return exhaustive;
    }
  }
}

function lcdClass(band: ThreatBand): string {
  switch (band) {
    case "nominal":
      return "";
    case "caution":
      return "caution";
    case "critical":
      return "critical";
    default: {
      const exhaustive: never = band;
      return exhaustive;
    }
  }
}

export function ThreatGauge({
  score,
  band,
  synthesis,
  scanning,
}: ThreatGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const start = -135;
  const sweep = 270;
  const angle = start + (clamped / 100) * sweep;
  const ticks = Array.from({ length: 21 }, (_, i) => i);
  const glow = glowForBand(band);

  return (
    <section className="panel-metal panel-pod relative flex h-full flex-col items-center px-6 pb-5 pt-4">
      <header className="mb-1 flex w-full items-center justify-between">
        <p className="font-display text-[11px] tracking-[0.32em] text-silver">
          THREAT // 脅威
        </p>
        <p className="font-readout text-[11px] tracking-[0.22em] text-blood-hot">
          {bandLabel(band)}
        </p>
      </header>

      <div className="relative mt-1 flex w-full max-w-[340px] items-center justify-center">
        <svg viewBox="0 0 220 220" className="h-[270px] w-[270px] drop-shadow-lg">
          <defs>
            <linearGradient id="bezel" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f2f5f8" />
              <stop offset="42%" stopColor="#9aa3ae" />
              <stop offset="100%" stopColor="#3c424a" />
            </linearGradient>
            <filter id="bloodGlow">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx="110" cy="110" r="104" fill="url(#bezel)" />
          <circle cx="110" cy="110" r="92" fill="#16191e" />
          <circle
            cx="110"
            cy="110"
            r="88"
            fill="#0c0e11"
            stroke={glow}
            strokeWidth="2"
            style={{ filter: `drop-shadow(0 0 10px ${glow})` }}
          />
          {ticks.map((tick) => {
            const tAngle = start + (tick / 20) * sweep;
            const rad = (tAngle * Math.PI) / 180;
            const inner = tick % 5 === 0 ? 68 : 74;
            const x1 = 110 + Math.cos(rad) * inner;
            const y1 = 110 + Math.sin(rad) * inner;
            const x2 = 110 + Math.cos(rad) * 82;
            const y2 = 110 + Math.sin(rad) * 82;
            const criticalTick = tick >= 14;
            return (
              <line
                key={tick}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={criticalTick ? "#ff1a4b" : "#c5cdd6"}
                strokeWidth={tick % 5 === 0 ? 2.4 : 1}
                opacity={criticalTick ? 0.95 : 0.55}
              />
            );
          })}
          <g
            style={{
              transform: `rotate(${angle}deg)`,
              transformOrigin: "110px 110px",
              transition: "transform 500ms ease",
              filter: `drop-shadow(0 0 6px ${glow})`,
            }}
          >
            <polygon points="110,28 114,118 106,118" fill="#ff1a4b" />
            <circle cx="110" cy="110" r="9" fill="#e8eef4" stroke="#ff1a4b" strokeWidth="2" />
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-6">
          <p className="font-display text-[10px] tracking-[0.38em] text-silver/70">
            SCORE
          </p>
          <p
            className={`font-readout text-6xl leading-none ${
              band === "critical" ? "text-blood-hot" : "text-chrome"
            }`}
            style={{ textShadow: `0 0 18px ${glow}` }}
          >
            {clamped.toString().padStart(2, "0")}
          </p>
        </div>
      </div>

      <div
        className={`lcd-face ${lcdClass(band)} relative mt-1 w-full overflow-hidden rounded-xl px-4 py-3`}
      >
        {scanning ? <div className="scan-sweep absolute inset-y-0 w-1/3" /> : null}
        <p className="font-display text-[9px] tracking-[0.3em] text-silver/70">
          STATUS SYNTHESIS // 状態
        </p>
        <p className="relative mt-1 font-readout text-[13px] leading-relaxed">
          {synthesis}
        </p>
      </div>
    </section>
  );
}
