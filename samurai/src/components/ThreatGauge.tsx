import { bandLabel } from "../lib/types";
import type { ThreatBand } from "../lib/types";
import { DeckPanel, SectionHead } from "./Deck";

interface ThreatGaugeProps {
  score: number;
  band: ThreatBand;
  synthesis: string;
  scanning: boolean;
}

function glowForBand(band: ThreatBand): string {
  switch (band) {
    case "nominal":
      return "rgba(232, 238, 244, 0.65)";
    case "caution":
      return "rgba(240, 196, 203, 0.6)";
    case "critical":
      return "rgba(255, 26, 75, 0.85)";
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
    <DeckPanel>
      <SectionHead en="PROTECTION" jp="防御" meta={bandLabel(band)} />
      <div className="relative mx-auto flex w-full max-w-[220px] items-center justify-center">
        <svg viewBox="0 0 220 220" className="h-[200px] w-[200px]">
          <defs>
            <linearGradient id="bezel" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="38%" stopColor="#c5cdd6" />
              <stop offset="100%" stopColor="#3c424a" />
            </linearGradient>
          </defs>
          <circle cx="110" cy="110" r="104" fill="url(#bezel)" />
          <circle cx="110" cy="110" r="92" fill="#12151a" />
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
            const hot = tick >= 14;
            return (
              <line
                key={tick}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={hot ? "#ff1a4b" : "#d7dee6"}
                strokeWidth={tick % 5 === 0 ? 2.2 : 1}
                opacity={hot ? 0.95 : 0.5}
              />
            );
          })}
          <g
            style={{
              transform: `rotate(${angle}deg)`,
              transformOrigin: "110px 110px",
              transition: "transform 500ms ease",
            }}
          >
            <polygon points="110,30 114,118 106,118" fill="#ff1a4b" />
            <circle cx="110" cy="110" r="8" fill="#f4f7fb" stroke="#ff1a4b" strokeWidth="2" />
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
          <p className="font-display text-[9px] tracking-[0.28em] text-silver/70">LEVEL</p>
          <p
            className={`font-readout text-5xl leading-none ${
              band === "critical" ? "text-blood-hot" : "text-chrome"
            }`}
            style={{ textShadow: `0 0 16px ${glow}` }}
          >
            {clamped.toString().padStart(2, "0")}
          </p>
        </div>
      </div>
      <div className={`lcd-face ${lcdClass(band)} relative mt-3 rounded-[10px] px-3 py-2.5`}>
        {scanning ? <div className="scan-sweep absolute inset-y-0 w-1/3" /> : null}
        <p className="relative font-readout text-[12px] leading-relaxed">{synthesis}</p>
      </div>
    </DeckPanel>
  );
}
