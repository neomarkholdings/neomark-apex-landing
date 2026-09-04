interface ScrewProps {
  className?: string;
}

export function Screw({ className = "" }: ScrewProps) {
  return <span className={`screw ${className}`} aria-hidden="true" />;
}

interface LedProps {
  on: boolean;
  silver?: boolean;
  className?: string;
}

export function Led({ on, silver = false, className = "" }: LedProps) {
  const tone = silver ? "silver-on" : "on";
  return (
    <span
      className={`led ${on ? tone : ""} ${className}`}
      aria-hidden="true"
    />
  );
}

interface VentProps {
  slots?: number;
  className?: string;
}

export function Vent({ slots = 8, className = "" }: VentProps) {
  return (
    <span className={`vent ${className}`} aria-hidden="true">
      {Array.from({ length: slots }, (_, index) => (
        <span key={index} className="vent-slot" />
      ))}
    </span>
  );
}
