import { Led } from "./HardwareBits";

interface HardwareToggleProps {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  offLabel: string;
  offKana: string;
  onLabel: string;
  onKana: string;
}

export function HardwareToggle({
  checked,
  onToggle,
  disabled = false,
  offLabel,
  offKana,
  onLabel,
  onKana,
}: HardwareToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className="w-full rounded-[18px] px-3 py-3 panel-metal active:translate-y-[1px]"
    >
      <div className="mb-2 flex items-center justify-between gap-2 font-display text-[10px] tracking-[0.18em] text-silver">
        <span className={checked ? "opacity-45" : "text-chrome"}>
          {offLabel}
          <span className="mt-0.5 block font-jp text-[9px] tracking-widest opacity-80">
            {offKana}
          </span>
        </span>
        <span className={checked ? "text-blood-hot" : "opacity-45"}>
          {onLabel}
          <span className="mt-0.5 block font-jp text-[9px] tracking-widest opacity-80">
            {onKana}
          </span>
        </span>
      </div>
      <div className="rocker-track relative h-14 overflow-hidden rounded-full px-1.5">
        <div
          className={`rocker-knob absolute top-1.5 h-11 w-[46%] rounded-full transition-all duration-200 ${
            checked ? "left-[52%]" : "left-1.5"
          }`}
        >
          <span className="absolute inset-x-3 top-1.5 h-2 rounded-full bg-white/50" />
          <span className="absolute inset-x-5 bottom-2 h-px bg-black/30" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          <Led on={checked} />
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
          <Led on={!checked} silver />
        </div>
      </div>
    </button>
  );
}
