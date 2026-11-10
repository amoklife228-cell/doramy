import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, exportLibrary, importLibrary } from '../lib/db';
import { useConfigured } from '../lib/hooks';
import { BUILTIN_KEY, clearCredential, getCredential, hasOwnCredential, saveCredential } from '../lib/tmdb';

export function Settings() {
  const configured = useConfigured();
  const count = useLiveQuery(() => db.library.count(), []) ?? 0;
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const masked = (() => {
    const c = getCredential();
    return c.length > 8 ? `${c.slice(0, 4)}…${c.slice(-4)}` : c;
  })();

  const onSave = () => {
    if (value.trim().length < 10) {
      setMessage('Ключ слишком короткий. Скопируйте его целиком.');
      return;
    }
    saveCredential(value);
    setValue('');
    setMessage('Ключ сохранён. Откройте «Каталог».');
  };

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
        <section className="block">
          <h2>Ключ TMDB</h2>
          {configured && !hasOwnCredential() && BUILTIN_KEY ? (
            <p className="muted">Используется встроенный ключ, ничего настраивать не нужно. При желании можно указать свой.</p>
          ) : configured ? (
            <p className="muted">
              Ваш ключ сохранён: <code>{masked}</code>
            </p>
          ) : (
            <p className="muted">
              Нужен, чтобы загружать каталог и поиск. Бесплатно: зарегистрируйтесь на themoviedb.org, откройте{' '}
              <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
                Settings → API
              </a>{' '}
              и скопируйте «API Key» или «API Read Access Token».
            </p>
          )}
          <div className="keyform">
            <input
              type="text"
              placeholder={hasOwnCredential() ? 'Вставьте новый ключ, чтобы заменить' : 'Вставьте свой ключ (необязательно)'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <button className="btn btn-primary" onClick={onSave} disabled={!value.trim()}>
              Сохранить
            </button>
          </div>
          {hasOwnCredential() && (
            <button className="btn btn-danger-text" onClick={() => { clearCredential(); setMessage('Свой ключ удалён.'); }}>
              Удалить свой ключ
            </button>
          )}
        </section>

        <section className="block">
          <h2>Библиотека</h2>
          <p className="muted">
            Записей: {count}. Данные хранятся только на этом устройстве. Сделайте резервную копию, чтобы не потерять
            библиотеку при очистке Safari или смене телефона.
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
          Данные о сериалах предоставлены TMDB. Этот продукт использует TMDB API, но не одобрен и не сертифицирован TMDB.
        </p>
      </div>
    </>
  );
}
