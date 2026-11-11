import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Session } from '@supabase/supabase-js';
import { db, exportLibrary, importLibrary } from '../lib/db';
import { goBack } from '../lib/router';
import {
  applyAppearance,
  BOTTOM_OFFSET_RANGE,
  DEFAULT_APPEARANCE,
  isDefaultAppearance,
  loadAppearance,
  saveAppearance,
  TABBAR_GAP_RANGE,
  type Appearance,
} from '../lib/appearance';
import { AccountSection } from './Account';

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** Раздел «Внешний вид»: поправки положения нижней панели, применяются сразу. */
function AppearanceSection() {
  const [a, setA] = useState<Appearance>(loadAppearance);

  const update = (patch: Partial<Appearance>) => {
    const next = { ...a, ...patch };
    setA(next);
    applyAppearance(next);
    saveAppearance(next);
  };

  return (
    <section className="block">
      <h2>Внешний вид</h2>
      <div className="tune">
        <label className="tune-row">
          <span className="tune-head">
            <span>Поднять панель снизу</span>
            <span className="tune-value">{signed(a.bottomOffset)} px</span>
          </span>
          <input
            type="range"
            min={BOTTOM_OFFSET_RANGE.min}
            max={BOTTOM_OFFSET_RANGE.max}
            step={BOTTOM_OFFSET_RANGE.step}
            value={a.bottomOffset}
            onChange={(e) => update({ bottomOffset: Number(e.target.value) })}
          />
          <p className="muted small tune-hint">
            Если под панелью остаётся пустая полоса, сдвиньте влево (в минус). Если панель прижата к краю, вправо.
          </p>
        </label>
        <label className="tune-row">
          <span className="tune-head">
            <span>Зазор панели от края</span>
            <span className="tune-value">{a.tabbarGap} px</span>
          </span>
          <input
            type="range"
            min={TABBAR_GAP_RANGE.min}
            max={TABBAR_GAP_RANGE.max}
            step={TABBAR_GAP_RANGE.step}
            value={a.tabbarGap}
            onChange={(e) => update({ tabbarGap: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="status-buttons" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => update({ ...DEFAULT_APPEARANCE })} disabled={isDefaultAppearance(a)}>
          Сбросить
        </button>
      </div>
      <p className="muted small">Настройка хранится только на этом устройстве.</p>
    </section>
  );
}

/** Строка для отладки: режим запуска, размеры окна и отступы безопасной зоны. */
function diagnostics(): string {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom);visibility:hidden';
  document.body.appendChild(probe);
  const safeBottom = Math.round(probe.getBoundingClientRect().height);
  probe.remove();
  const vv = window.visualViewport;
  return [
    `Режим: ${standalone ? 'приложение' : 'браузер'}`,
    `окно ${window.innerWidth}×${window.innerHeight}`,
    vv ? `видимая область ${Math.round(vv.width)}×${Math.round(vv.height)}` : '',
    `экран ${screen.width}×${screen.height}`,
    `нижний отступ ${safeBottom}`,
    `iOS ${/OS (\d+)_/.exec(navigator.userAgent)?.[1] ?? '?'}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function Settings({ session }: { session: Session | null | undefined }) {
  const count = useLiveQuery(() => db.items.count(), []) ?? 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && goBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const onExport = async () => {
    const json = await exportLibrary();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doramy-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const n = await importLibrary(await file.text());
      setMessage(`Импортировано записей: ${n}.`);
    } catch (e) {
      setMessage(`Не удалось импортировать: ${(e as Error).message}`);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="detail" role="dialog" aria-modal="true">
      <header className="detail-bar">
        <button className="back" onClick={goBack} aria-label="Назад">
          ‹ Назад
        </button>
        <span className="detail-kind">Настройки</span>
      </header>
      <div className="content settings detail-content">
        <AccountSection session={session} />

        <AppearanceSection />

        <section className="block">
          <h2>Резервная копия</h2>
          <p className="muted">
            Записей в библиотеке: {count}. Экспорт сохраняет всё в файл, импорт восстанавливает из него.
            {session ? '' : ' Без аккаунта данные живут только на этом устройстве, так что копию стоит делать.'}
          </p>
          <div className="status-buttons">
            <button className="btn" onClick={() => void onExport()} disabled={count === 0}>
              Экспорт в файл
            </button>
            <button className="btn" onClick={() => fileInput.current?.click()}>
              Импорт из файла
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => void onImport(e.target.files?.[0])}
            />
          </div>
        </section>

        <section className="block">
          <h2>Установить на iPhone</h2>
          <ol className="steps">
            <li>Откройте этот сайт в Safari.</li>
            <li>Нажмите кнопку «Поделиться» внизу экрана (квадрат со стрелкой вверх).</li>
            <li>Выберите «На экран “Домой”» и нажмите «Добавить».</li>
          </ol>
          <p className="muted small">
            Приложение откроется без адресной строки, как обычное, и будет работать офлайн с уже загруженными данными.
          </p>
        </section>

        {message && <div className="toast">{message}</div>}

        <p className="muted small credit">
          Данные о сериалах и фильмах предоставлены TMDB. Этот продукт использует TMDB API, но не одобрен и не
          сертифицирован TMDB.
        </p>
        <p className="muted small">{diagnostics()}</p>
      </div>
    </div>
  );
}
