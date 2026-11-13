import type { ReactNode } from 'react';

/** Сгруппированный список в стиле системных «Настроек» iOS: заголовок, карточка со строками, сноска. */
export function IosSection({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ios-section">
      {title && <h2 className="ios-section-title">{title}</h2>}
      <div className="ios-list">{children}</div>
      {footer && <p className="ios-footer">{footer}</p>}
    </section>
  );
}

type RowProps = {
  label?: ReactNode;
  /** Вторая строка под названием. */
  sub?: ReactNode;
  /** Значение справа серым. */
  value?: ReactNode;
  icon?: ReactNode;
  iconColor?: string;
  chevron?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  /** Красная строка-действие. */
  accent?: boolean;
  /** Деструктивное действие. */
  destructive?: boolean;
  /** Текст по центру (как «Выйти»). */
  center?: boolean;
  /** Произвольное содержимое строки (поля ввода, ползунки). */
  children?: ReactNode;
  className?: string;
};

export function IosRow({
  label,
  sub,
  value,
  icon,
  iconColor,
  chevron,
  onClick,
  disabled,
  accent,
  destructive,
  center,
  children,
  className = '',
}: RowProps) {
  const cls = [
    'ios-row',
    icon ? 'has-icon' : '',
    accent ? 'ios-row-accent' : '',
    destructive ? 'ios-row-destructive' : '',
    center ? 'ios-row-center' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const body = (
    <>
      {icon && (
        <span className="ios-icon" style={iconColor ? { background: iconColor } : undefined}>
          {icon}
        </span>
      )}
      {(label || sub) && (
        <span className="ios-row-main">
          {label && <span className="ios-row-label">{label}</span>}
          {sub && <span className="ios-row-sub">{sub}</span>}
        </span>
      )}
      {children}
      {value !== undefined && value !== null && <span className="ios-row-value">{value}</span>}
      {chevron && <Chevron />}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} disabled={disabled}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** Переключатель iOS (51×31). */
export function IosSwitch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      role="switch"
      className="ios-switch"
      aria-label={label}
      aria-checked={checked}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

function Chevron() {
  return (
    <svg className="ios-chevron" viewBox="0 0 8 14" fill="none" aria-hidden="true">
      <path d="M1 1l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* Иконки строк (однотонные, в белых цветах на цветном квадрате). */
const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const RowIcons = {
  person: (
    <svg viewBox="0 0 24 24" {...s}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  ),
  sync: (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M20 12a8 8 0 0 1-14.5 4.6M4 12a8 8 0 0 1 14.5-4.6" />
      <path d="M18 3v4.5h-4.5M6 21v-4.5h4.5" />
    </svg>
  ),
  sliders: (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </svg>
  ),
  exportUp: (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M12 15V4m0 0L8 8m4-4l4 4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  ),
  importDown: (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M12 4v11m0 0l-4-4m4 4l4-4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  ),
  share: (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M12 14V3m0 0L8.5 6.5M12 3l3.5 3.5" />
      <path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
    </svg>
  ),
  plusSquare: (
    <svg viewBox="0 0 24 24" {...s}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" {...s}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" {...s}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <path d="M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01" strokeWidth={2.6} />
    </svg>
  ),
  film: (
    <svg viewBox="0 0 24 24" {...s}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M7.5 5v14M16.5 5v14M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M5 20V11M12 20V5M19 20v-6" strokeWidth={2.4} />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  ),
  /** «Итоги года»: вспышка с искрой. */
  sparkles: (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M10 3.5l1.9 5.1 5.1 1.9-5.1 1.9L10 17.5l-1.9-5.1L3 10.5l5.1-1.9z" />
      <path d="M17.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </svg>
  ),
};

/* Цвета квадратов как в iOS */
export const IconColors = {
  red: '#e5202e',
  blue: '#0a84ff',
  green: '#30d158',
  orange: '#ff9f0a',
  gray: '#8e8e93',
  purple: '#bf5af2',
  teal: '#64d2ff',
};
