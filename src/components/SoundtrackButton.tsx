import { useEffect, useId, useRef, useState } from 'react';
import { useDesktop } from '../lib/media';
import { COUNTRY_CODES, type Drama } from '../lib/types';
import './SoundtrackButton.css';

type SoundtrackDrama = Pick<Drama, 'title' | 'originalTitle' | 'originCountries'>;

/** Хангыль, кана, иероглифы, тайский. */
const ASIAN_SCRIPT = /[぀-ヿ㐀-鿿가-힯฀-๿]/;

/**
 * Ссылки поиска саундтрека. Для азиатских сериалов ищем по оригинальному названию:
 * «나의 아저씨 OST» находит корейские OST точнее, чем русское «Мой мистер».
 */
export function soundtrackLinks(d: SoundtrackDrama): { yandex: string; youtube: string; query: string } {
  const original = (d.originalTitle ?? '').trim();
  const asian = d.originCountries.some((c) => COUNTRY_CODES.has(c)) || ASIAN_SCRIPT.test(original);
  const base = asian && original ? original : d.title.trim() || original;
  return {
    query: base,
    yandex: `https://music.yandex.ru/search?text=${encodeURIComponent(`${base} OST`)}`,
    youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${base} OST playlist`)}`,
  };
}

/**
 * Кнопка «Саундтрек» с меню из двух вариантов: Яндекс Музыка и YouTube (открываются в новой вкладке).
 * wide — во всю ширину, как «Найти в интернете» в карточке на телефоне.
 */
export function SoundtrackButton({ drama, wide = false }: { drama: SoundtrackDrama; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const desktop = useDesktop();
  const links = soundtrackLinks(drama);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    // Захват на window: Escape закрывает меню, а не всю карточку.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
    next?.focus();
  };

  return (
    <div ref={root} className={`ost${wide ? ' ost-wide' : ''}`} data-open={open} data-up={desktop && !wide}>
      <button
        ref={button}
        type="button"
        className={`btn btn-search ost-btn${wide ? ' btn-wide' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <NoteIcon />
        Саундтрек
      </button>
      {open && (
        <div id={menuId} className="ost-menu" role="menu" aria-label="Где слушать саундтрек" onKeyDown={onMenuKey}>
          <a
            role="menuitem"
            className="ost-item"
            href={links.yandex}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <span className="ost-icon ost-icon-music" aria-hidden="true">
              <NoteIcon />
            </span>
            <span className="ost-text">
              <span className="ost-label">Яндекс Музыка</span>
              <span className="ost-sub">{links.query} OST</span>
            </span>
          </a>
          <a
            role="menuitem"
            className="ost-item"
            href={links.youtube}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <span className="ost-icon ost-icon-video" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M9.5 7.5v9l7.5-4.5z" className="ost-fill" />
              </svg>
            </span>
            <span className="ost-text">
              <span className="ost-label">YouTube</span>
              <span className="ost-sub">Плейлист OST</span>
            </span>
          </a>
        </div>
      )}
    </div>
  );
}

function NoteIcon() {
  return (
    <svg className="ost-note" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 17.5V5.8l10-2.3v11.7" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="16.5" cy="15.2" r="2.5" />
    </svg>
  );
}
