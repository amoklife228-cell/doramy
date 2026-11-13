import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Session } from '@supabase/supabase-js';
import { db, exportLibrary, importLibrary } from '../lib/db';
import { goBack, navigate } from '../lib/router';
import { checkAdmin } from '../lib/admin';
import { currentIosGap } from '../lib/viewportFix';
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
import { IconColors, IosRow, IosSection, RowIcons } from '../components/IosList';
import { NavBar } from '../components/NavBar';
import { plural } from './Profile';
import { AccountSection } from './Account';

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
    `исправление полосы ${currentIosGap()}`,
    `iOS ${/OS (\d+)_/.exec(navigator.userAgent)?.[1] ?? '?'}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

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
    <IosSection
      title="Внешний вид"
      footer="Если под нижней панелью остаётся пустая полоса, сдвиньте первый ползунок влево. Настройка хранится только на этом устройстве."
    >
      <IosRow className="ios-row-stack">
        <span className="ios-stack-head">
          <span className="ios-row-label">Поднять панель снизу</span>
          <span className="ios-row-value ios-value-accent">{signed(a.bottomOffset)} px</span>
        </span>
        <input
          type="range"
          aria-label="Поднять панель снизу"
          min={BOTTOM_OFFSET_RANGE.min}
          max={BOTTOM_OFFSET_RANGE.max}
          step={BOTTOM_OFFSET_RANGE.step}
          value={a.bottomOffset}
          onChange={(e) => update({ bottomOffset: Number(e.target.value) })}
        />
      </IosRow>
      <IosRow className="ios-row-stack">
        <span className="ios-stack-head">
          <span className="ios-row-label">Зазор панели от края</span>
          <span className="ios-row-value ios-value-accent">{a.tabbarGap} px</span>
        </span>
        <input
          type="range"
          aria-label="Зазор панели от края"
          min={TABBAR_GAP_RANGE.min}
          max={TABBAR_GAP_RANGE.max}
          step={TABBAR_GAP_RANGE.step}
          value={a.tabbarGap}
          onChange={(e) => update({ tabbarGap: Number(e.target.value) })}
        />
      </IosRow>
      <IosRow
        label="Сбросить"
        accent
        center
        disabled={isDefaultAppearance(a)}
        onClick={() => update({ ...DEFAULT_APPEARANCE })}
      />
    </IosSection>
  );
}

export function Settings({ session }: { session: Session | null | undefined }) {
  const count = useLiveQuery(() => db.items.count(), []) ?? 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && goBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [message, setMessage] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!session) return setIsAdmin(false);
    let alive = true;
    checkAdmin().then(
      (ok) => alive && setIsAdmin(ok === true),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [session]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

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
      <NavBar backLabel="Профиль" />
      <div className="content detail-content ios-page">
        <h1 className="ios-large-title">Настройки</h1>

        <AccountSection session={session} />

        {isAdmin && (
          <IosSection>
            <IosRow
              icon={RowIcons.chart}
              iconColor={IconColors.purple}
              label="Админ-панель"
              sub="Кто и как пользуется приложением"
              chevron
              onClick={() => navigate('/admin')}
            />
          </IosSection>
        )}

        <AppearanceSection />

        <IosSection
          title="Резервная копия"
          footer={
            session
              ? 'Копия пригодится, если захотите перенести библиотеку вручную.'
              : 'Без аккаунта данные живут только на этом устройстве, так что копию стоит делать.'
          }
        >
          <IosRow
            icon={RowIcons.exportUp}
            iconColor={IconColors.blue}
            label="Экспорт в файл"
            value={count ? `${count} ${plural(count, 'запись', 'записи', 'записей')}` : 'пусто'}
            chevron
            disabled={count === 0}
            onClick={() => void onExport()}
          />
          <IosRow
            icon={RowIcons.importDown}
            iconColor={IconColors.green}
            label="Импорт из файла"
            chevron
            onClick={() => fileInput.current?.click()}
          />
        </IosSection>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void onImport(e.target.files?.[0])}
        />

        <IosSection
          title="Установка на iPhone"
          footer="Приложение откроется без адресной строки, как обычное, и будет работать офлайн с уже загруженными данными."
        >
          <IosRow icon={<Step n={1} />} label="Откройте сайт в Safari" sub="Из других браузеров иконка откроет обычный сайт" />
          <IosRow icon={<Step n={2} />} label="Нажмите «Поделиться»" sub="Квадрат со стрелкой вверх внизу экрана" />
          <IosRow icon={<Step n={3} />} label="«На экран “Домой”» → «Добавить»" />
        </IosSection>

        <IosSection
          title="О приложении"
          footer={
            <>
              Данные о сериалах и фильмах предоставлены TMDB. Этот продукт использует TMDB API, но не одобрен и не
              сертифицирован TMDB. Приложение анонимно считает заходы (без имён и email), чтобы автор видел, сколько людей им
              пользуется.
              <br />
              <span className="ios-diag">{diagnostics()}</span>
            </>
          }
        >
          <IosRow icon={RowIcons.film} iconColor={IconColors.gray} label="Источник данных" value="TMDB" />
          <IosRow
            icon={RowIcons.info}
            iconColor={IconColors.orange}
            label="Сайт приложения"
            value="github.io"
            chevron
            onClick={() => window.open('https://amoklife228-cell.github.io/doramy/', '_blank', 'noopener')}
          />
        </IosSection>

        {message && <div className="toast">{message}</div>}
      </div>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return <span className="ios-step">{n}</span>;
}
