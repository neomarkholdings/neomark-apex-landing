import { Screw } from "./HardwareBits";

const VAULT = [
  { id: "music", en: "/Music", jp: "音楽" },
  { id: "studio", en: "/Studio-Projects", jp: "スタジオ" },
  { id: "neomark", en: "neomark", jp: "ネオマーク" },
  { id: "retro", en: "retroblazed", jp: "レトロ" },
] as const;

export function CreationsVault() {
  return (
    <section className="panel-metal panel-pod relative px-5 py-4">
      <Screw className="absolute left-3 top-3" />
      <Screw className="absolute right-3 top-3" />
      <header className="mb-3 pr-6">
        <p className="font-display text-[11px] tracking-[0.32em] text-silver">
          CREATIONS VAULT // 聖域
        </p>
        <p className="mt-1 font-readout text-[11px] leading-relaxed text-silver/70">
          Samurai will hunt malware. Amoeba will only restore from your own
          shadow copies. Sanctuary paths are never rewritten, quarantined, or
          deleted.
        </p>
      </header>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {VAULT.map((item) => (
          <li
            key={item.id}
            className="crt-well flex items-center justify-between rounded-2xl px-3 py-3"
          >
            <div>
              <p className="font-readout text-xs text-chrome">{item.en}</p>
              <p className="font-jp text-[10px] tracking-[0.2em] text-blood-hot">
                {item.jp}
              </p>
            </div>
            <span className="font-display text-[9px] tracking-[0.18em] text-silver/70">
              LOCKED
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
