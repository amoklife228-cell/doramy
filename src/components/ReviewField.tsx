import { useEffect, useRef, useState } from 'react';
import { updateEntry } from '../lib/db';
import type { SavedDrama } from '../lib/types';
import { IosRow, IosSection } from './IosList';
import './review.css';

export const REVIEW_MAX = 500;

/**
 * «Мой отзыв»: пара слов о сериале или фильме рядом с оценкой.
 * Сохраняется сам через полсекунды после ввода и при уходе с экрана (как «Заметки» в карточке):
 * на iOS «Назад» не снимает фокус с поля, поэтому на onBlur полагаться нельзя.
 */
export function ReviewField({ entry }: { entry: Pick<SavedDrama, 'key' | 'review'> }) {
  const saved = entry.review ?? '';
  const [text, setText] = useState(saved);
  const pending = useRef<{ key: string; review: string } | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const flush = () => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    void updateEntry(p.key, { review: p.review.trim() ? p.review : '' });
  };

  useEffect(() => {
    if (text === saved) {
      // Вернули текст к сохранённому — отменяем отложенную запись, иначе onBlur сохранит промежуточный вариант.
      pending.current = null;
      return;
    }
    pending.current = { key: entry.key, review: text };
    const t = setTimeout(flush, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  useEffect(() => flush, []);

  // Отзыв поменяли на другом устройстве, а здесь его сейчас не редактируют — показываем новый.
  useEffect(() => {
    if (!pending.current && document.activeElement !== ref.current) setText(saved);
  }, [saved]);

  const left = REVIEW_MAX - text.length;
  return (
    <IosSection title="Мой отзыв" footer="Видно только вам. Сохраняется автоматически.">
      <IosRow className="ios-row-stack review-row">
        <textarea
          ref={ref}
          className="ios-textarea review-textarea"
          rows={3}
          maxLength={REVIEW_MAX}
          placeholder="Чем запомнился? Пара слов для себя"
          aria-label="Мой отзыв"
          aria-describedby={`review-count-${entry.key}`}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, REVIEW_MAX))}
          onBlur={flush}
        />
        <span
          id={`review-count-${entry.key}`}
          className="review-count"
          data-near={left <= 50}
          aria-live={left <= 50 ? 'polite' : 'off'}
        >
          {text.length} / {REVIEW_MAX}
        </span>
      </IosRow>
    </IosSection>
  );
}

/** Строка отзыва под названием в списке библиотеки. */
export function ReviewLine({ text }: { text: string | undefined }) {
  const t = text?.trim();
  if (!t) return null;
  return (
    <div className="row-review" title={t}>
      «{t.replace(/\s+/g, ' ')}»
    </div>
  );
}
