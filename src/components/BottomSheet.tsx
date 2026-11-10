import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Шторка снизу: закрывается по фону, Escape. Рисуется порталом в body: экраны-вкладки
 * имеют position: fixed и создают свой слой, иначе панель вкладок перекрывала бы шторку.
 */
export function BottomSheet({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  label: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" aria-hidden />
        {children}
      </div>
    </div>,
    document.body,
  );
}
