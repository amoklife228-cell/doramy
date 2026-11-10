import { useRef } from 'react';
import { usePullToRefresh } from '../lib/pullToRefresh';

/** Прокручиваемая область с обновлением потягиванием вниз. */
export function Refreshable({
  onRefresh,
  className = '',
  children,
}: {
  onRefresh: () => Promise<unknown> | unknown;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { pull, refreshing, ready } = usePullToRefresh(ref, onRefresh);

  return (
    <div ref={ref} className={`content ${className}`}>
      <div className="ptr" style={{ height: pull }} aria-hidden={pull === 0}>
        <span className="ptr-dot" data-spin={refreshing} data-ready={ready} />
        <span className="ptr-text">{refreshing ? 'Обновляем…' : ready ? 'Отпустите' : 'Потяните, чтобы обновить'}</span>
      </div>
      {children}
    </div>
  );
}
