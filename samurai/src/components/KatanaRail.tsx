import type { CSSProperties } from "react";
import { STATION_SPECS, type BladeStation } from "../lib/stations";

type KatanaRailProps = {
  station: BladeStation;
  onSelect: (station: BladeStation) => void;
  unsheathed: boolean;
  onToggleSheathe: () => void;
  duty: Partial<Record<BladeStation, boolean>>;
};

export function KatanaRail({
  station,
  onSelect,
  unsheathed,
  onToggleSheathe,
  duty,
}: KatanaRailProps) {
  const drawnIndex = STATION_SPECS.findIndex((spec) => spec.id === station);

  return (
    <nav className="katana-saya" aria-label="Dojo stations">
      <p className="katana-tsuba" aria-hidden="true">
        <span className="katana-tsuba-mark">侍</span>
        <span className="katana-tsuba-edge" />
      </p>
      <div className="katana-hamon" role="tablist" aria-label="Stations">
        <span
          className="katana-pip"
          aria-hidden="true"
          style={{ "--drawn-index": String(Math.max(0, drawnIndex)) } as CSSProperties}
        />
        {STATION_SPECS.map((spec) => {
          const drawn = station === spec.id;
          const hasDuty = Boolean(duty[spec.id]);
          return (
            <button
              key={spec.id}
              type="button"
              role="tab"
              id={`station-${spec.id}`}
              aria-selected={drawn}
              aria-controls="drawn-blade"
              aria-label={hasDuty ? `${spec.title} · duty` : spec.title}
              title={spec.title}
              data-duty={hasDuty ? "true" : undefined}
              className={drawn ? "katana-me katana-me-drawn" : "katana-me"}
              onClick={() => onSelect(spec.id)}
            >
              {hasDuty ? <span className="katana-duty" aria-hidden="true" /> : null}
              <span className="katana-mark" aria-hidden="true">
                {spec.mark}
              </span>
              <span className="katana-name">{spec.title}</span>
              <span className="katana-kana" aria-hidden="true">
                {spec.kana}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={unsheathed ? "katana-habaki is-drawn" : "katana-habaki"}
        aria-label={unsheathed ? "Sheathe" : "Draw"}
        aria-pressed={unsheathed}
        title={unsheathed ? "Sheathe" : "Draw"}
        onClick={onToggleSheathe}
      >
        <span aria-hidden="true">{unsheathed ? "納" : "抜"}</span>
      </button>
    </nav>
  );
}
