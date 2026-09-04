import { bandLabel } from "../lib/types";
import type { ThreatBand } from "../lib/types";
import { DeckPanel, SectionHead } from "./Deck";
import { HardwareToggle } from "./HardwareToggle";

interface ThreatGaugeProps {
  score: number;
  band: ThreatBand;
  synthesis: string;
  scanning: boolean;
  liveWatch: boolean;
  rearmClock?: string | null;
  onToggle: () => void;
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
  liveWatch,
  rearmClock,
  onToggle,
}: ThreatGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const start = -135;
  const sweep = 270;
  const angle = start + (clamped / 100) * sweep;
  const ticks = Array.from({ length: 21 }, (_, i) => i);
  const glow = glowForBand(band);

  return (
    <DeckPanel>
      <SectionHead
        en="PROTECTION"
        jp="防御"
        meta={liveWatch ? bandLabel(band) : "DISARMED"}
      />
      <div className="relative mx-auto flex w-full max-w-[220px] items-center justify-center">
        <svg viewBox="0 0 220 220" className="h-[200px] w-[200px]">
          <defs>
            <linearGradient id="bezel" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="22%" stopColor="#e8eef4" />
              <stop offset="48%" stopColor="#9aa4b0" />
              <stop offset="78%" stopColor="#3c424a" />
              <stop offset="100%" stopColor="#16191e" />
            </linearGradient>
            <radialGradient id="dial" cx="42%" cy="32%" r="70%">
              <stop offset="0%" stopColor="#1c2128" />
              <stop offset="70%" stopColor="#0b0d11" />
              <stop offset="100%" stopColor="#050608" />
            </radialGradient>
            <filter id="needle-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="2" dy="3" stdDeviation="2" floodColor="#000" floodOpacity="0.55" />
            </filter>
          </defs>
          <circle cx="110" cy="110" r="106" fill="#12151a" />
          <circle cx="110" cy="110" r="104" fill="url(#bezel)" />
          <circle cx="110" cy="110" r="96" fill="#2a3038" />
          <circle cx="110" cy="110" r="92" fill="url(#dial)" />
          <circle
            cx="110"
            cy="110"
            r="88"
            fill="none"
            stroke={glow}
            strokeWidth="2"
            style={{ filter: `drop-shadow(0 0 10px ${glow})` }}
          />
          {ticks.map((tick) => {
            const tAngle = start + (tick / 20) * sweep;
            const rad = (tAngle * Math.PI) / 180;
            const inner = tick % 5 === 0 ? 66 : 74;
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
                strokeWidth={tick % 5 === 0 ? 2.4 : 1}
                opacity={hot ? 0.95 : 0.48}
              />
            );
          })}
          <text
            x="48"
            y="168"
            fill="#8b949e"
            fontSize="8"
            letterSpacing="2"
            fontFamily="Orbitron, sans-serif"
          >
            SAFE
          </text>
          <text
            x="148"
            y="168"
            fill="#ff4d73"
            fontSize="8"
            letterSpacing="2"
            fontFamily="Orbitron, sans-serif"
          >
            HOT
          </text>
          <g
            filter="url(#needle-shadow)"
            style={{
              transform: `rotate(${angle}deg)`,
              transformOrigin: "110px 110px",
              transition: "transform 500ms ease",
            }}
          >
            <polygon points="110,28 115,118 105,118" fill="#ff1a4b" />
            <circle cx="110" cy="110" r="10" fill="#f4f7fb" stroke="#ff1a4b" strokeWidth="2" />
            <circle cx="110" cy="110" r="4" fill="#6e0b1e" />
          </g>
        </svg>
        <div className="gauge-glass" />
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
          <p className="mt-1 font-jp text-[10px] tracking-[0.28em] text-blood-hot/70">防御</p>
        </div>
      </div>
      <div className={`lcd-face ${lcdClass(band)} relative mt-3 rounded-[10px] px-3 py-2.5`}>
        {scanning ? <div className="scan-sweep absolute inset-y-0 w-1/3" /> : null}
        <p className="relative font-readout text-[12px] leading-relaxed">{synthesis}</p>
      </div>
      <div className="mt-3">
        <HardwareToggle
          checked={liveWatch}
          onToggle={onToggle}
          offLabel="DISARM"
          onLabel="ON"
          ariaLabel="Protection"
        />
      </div>
      {!liveWatch && rearmClock ? (
        <p className="mt-2 font-readout text-[12px] tracking-[0.12em] text-silver/80">
          RE-ARM {rearmClock}
        </p>
      ) : (
        <p className="mt-2 font-readout text-[11px] leading-relaxed text-silver/70">
          Holds pause when disarmed. Sanctuary stays locked. Protection re-arms on a timer.
        </p>
      )}
    </DeckPanel>
  );
}
