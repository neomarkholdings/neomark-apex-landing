interface JellyButtonProps {
  label: string;
  kana: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  silver?: boolean;
}

export function JellyButton({
  label,
  kana,
  onClick,
  disabled = false,
  pressed = false,
  silver = false,
}: JellyButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`jelly-btn ${silver ? "silver" : ""} ${pressed ? "pressed" : ""}`}
    >
      <span className="block text-[10px] leading-none">{label}</span>
      <span className="mt-1 block font-jp text-[9px] tracking-widest opacity-80">
        {kana}
      </span>
    </button>
  );
}
