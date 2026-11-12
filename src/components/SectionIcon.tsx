/**
 * Цветной значок перед заголовком раздела на компьютере («Новинки», «В тренде», «ТОП-500»…).
 * Цвета — в desktop.css по data-accent у раздела; на телефоне значок скрыт.
 */
export type SectionAccent =
  | 'new'
  | 'trending'
  | 'discussed'
  | 'editors'
  | 'top500'
  | 'awards'
  | 'recs'
  | 'continue';

const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const ICONS: Record<SectionAccent, React.ReactNode> = {
  // Звёздочка-вспышка
  new: <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" {...s} />,
  // Пламя
  trending: (
    <path
      d="M12 21c-3.6 0-6-2.4-6-5.6 0-3 2-4.8 3.2-6.6.4 1.5 1.2 2.4 2.2 2.8C11 8.4 12.4 5.4 15 3.5c-.2 2.8 1 4.6 2.2 6.3 1 1.4 1.8 2.8 1.8 4.7C19 18.4 16 21 12 21z"
      {...s}
    />
  ),
  // Облачко разговора
  discussed: <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5zM8 10h8M8 13h5" {...s} />,
  // Закладка со звездой
  editors: <path d="M6.5 3.5h11v17l-5.5-4-5.5 4zM12 7.5l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" {...s} />,
  // Корона
  top500: <path d="M4 8l4 3.5L12 5l4 6.5L20 8l-1.5 10h-13zM5.5 20.5h13" {...s} />,
  // Медаль
  awards: <path d="M8.5 3.5h7l-1.5 5h-4zM12 21a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM12 13l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" {...s} />,
  // Волшебная палочка
  recs: <path d="M4.5 19.5l10-10M13 5l1.5-1.5M18.5 9.5L20 8M17 3.5v2M20.5 7h-2M12.5 7.5l4 4" {...s} />,
  // Кнопка воспроизведения
  continue: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 8.5v7l5.5-3.5z" {...s} />,
};

export function SectionIcon({ accent }: { accent: SectionAccent }) {
  return (
    <span className="section-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">{ICONS[accent]}</svg>
    </span>
  );
}
