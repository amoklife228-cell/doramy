import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, exportLibrary, importLibrary } from '../lib/db';
import { useSession } from '../lib/supabase';
import { AccountSection } from './Account';

export function Settings() {
  const session = useSession();
  const count = useLiveQuery(() => db.items.count(), []) ?? 0;
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
    <>
      <header className="topbar">
        <h1>Настройки</h1>
      </header>
      <div className="content settings">
        <AccountSection session={session} />

        <section className="block">
          <h2>Резервная копия</h2>
          <p className="muted">
            Записей в библиотеке: {count}. Экспорт сохраняет всё в файл, импорт восстанавливает из него.
            {session ? '' : ' Без аккаунта данные живут только на этом устройстве, так что копию стоит делать.'}
          </p>
          <div className="status-buttons">
            <button className="btn" onClick={() => void onExport()} disabled={count === 0}>
              ⬇️ Экспорт в файл
            </button>
            <button className="btn" onClick={() => fileInput.current?.click()}>
              ⬆️ Импорт из файла
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
            <li>
              Нажмите кнопку «Поделиться» <span aria-hidden>⎙</span> внизу экрана.
            </li>
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
      </div>
    </>
  );
}
