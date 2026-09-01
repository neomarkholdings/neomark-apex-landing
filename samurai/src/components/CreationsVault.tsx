import { DeckPanel, SectionHead } from "./Deck";

const VAULT = [
  { id: "music", en: "/Music", jp: "音楽" },
  { id: "studio", en: "/Studio-Projects", jp: "スタジオ" },
  { id: "neomark", en: "neomark", jp: "ネオマーク" },
  { id: "retro", en: "retroblazed", jp: "レトロ" },
] as const;

export function CreationsVault() {
  return (
    <DeckPanel>
      <SectionHead en="PROTECTED FOLDERS" jp="聖域" meta="LOCKED" />
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {VAULT.map((item) => (
          <li key={item.id} className="vault-chip">
            <div className="min-w-0">
              <p className="truncate font-readout text-xs text-chrome">{item.en}</p>
              <p className="font-jp text-[10px] text-blood-hot">{item.jp}</p>
            </div>
            <span className="font-display text-[9px] tracking-[0.14em] text-silver/60">
              LOCK
            </span>
          </li>
        ))}
      </ul>
    </DeckPanel>
  );
}
