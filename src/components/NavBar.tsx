import type { ReactNode } from 'react';
import { goBack } from '../lib/router';

/** Шапка вложенного экрана как в iOS: «‹ Назад» слева, заголовок по центру, действие справа. */
export function NavBar({
  title,
  backLabel = 'Назад',
  onBack = goBack,
  right,
}: {
  title?: ReactNode;
  backLabel?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="nav-bar">
      <div className="nav-side">
        <BackButton label={backLabel} onClick={onBack} />
      </div>
      <div className="nav-title">{title}</div>
      <div className="nav-side nav-side-right">{right}</div>
    </header>
  );
}

export function BackButton({ label = 'Назад', onClick = goBack }: { label?: string; onClick?: () => void }) {
  return (
    <button type="button" className="back" onClick={onClick} aria-label={label}>
      <svg className="back-chevron" viewBox="0 0 12 21" fill="none" aria-hidden="true">
        <path d="M10 2L2 10.5 10 19" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
