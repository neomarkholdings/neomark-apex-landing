import { Led } from "./HardwareBits";

interface HardwareToggleProps {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  offLabel: string;
  onLabel: string;
}

export function HardwareToggle({
  checked,
  onToggle,
  disabled = false,
  offLabel,
  onLabel,
}: HardwareToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className="w-full"
    >
      <div className="mb-1.5 flex items-center justify-between font-display text-[10px] tracking-[0.16em] text-silver">
        <span className={checked ? "opacity-40" : "text-chrome"}>{offLabel}</span>
        <span className={checked ? "text-blood-hot" : "opacity-40"}>{onLabel}</span>
      </div>
      <div className="rocker-track relative h-11 overflow-hidden rounded-full">
        <div
          className={`rocker-knob absolute top-1 h-9 w-[46%] rounded-full transition-all duration-200 ${
            checked ? "left-[52%]" : "left-1"
          }`}
        >
          <span className="absolute inset-x-3 top-1 h-2 rounded-full bg-white/70" />
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
