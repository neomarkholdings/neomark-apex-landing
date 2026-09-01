import type { ReactNode } from "react";

interface SectionHeadProps {
  en: string;
  jp: string;
  meta?: string;
}

export function SectionHead({ en, jp, meta }: SectionHeadProps) {
  return (
    <header className="section-head">
      <h2>
        {en} <span>// {jp}</span>
      </h2>
      {meta ? <p>{meta}</p> : null}
    </header>
  );
}

interface DeckPanelProps {
  children: ReactNode;
  className?: string;
}

export function DeckPanel({ children, className = "" }: DeckPanelProps) {
  return <section className={`deck-panel ${className}`}>{children}</section>;
}
