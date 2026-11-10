import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { signIn, signOut, signUp, SYNC_AVAILABLE } from '../lib/supabase';
import { clearLocalAfterSignOut, syncNow, useSyncState } from '../lib/sync';

export function AccountSection({ session }: { session: Session | null | undefined }) {
  if (!SYNC_AVAILABLE) return null;
  return (
    <section className="block">
      <h2>Аккаунт</h2>
      {session === undefined ? (
        <p className="muted">Проверяем вход…</p>
      ) : session ? (
        <SignedIn session={session} />
      ) : (
        <SignInForm />
      )}
    </section>
  );
}

function SignedIn({ session }: { session: Session }) {
  const sync = useSyncState();
  const [confirm, setConfirm] = useState(false);

  const onSignOut = async () => {
    const uid = session.user.id;
    await signOut();
    await clearLocalAfterSignOut(uid);
    setConfirm(false);
  };

  const when = sync.lastSync ? new Date(sync.lastSync).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <>
      <p className="muted">
        Вы вошли как <strong>{session.user.email}</strong>. Библиотека хранится в аккаунте и доступна на любом
        устройстве после входа.
      </p>
      <p className="muted small">
        {sync.status === 'syncing' && 'Синхронизация…'}
        {sync.status === 'idle' && (when ? `Синхронизировано в ${when}` : 'Готово к синхронизации')}
        {sync.status === 'error' && `Ошибка синхронизации: ${sync.error}`}
      </p>
      <div className="status-buttons">
        <button className="btn" onClick={() => void syncNow()} disabled={sync.status === 'syncing'}>
          🔄 Синхронизировать
        </button>
        {confirm ? (
          <>
            <button className="btn btn-danger" onClick={() => void onSignOut()}>
              Да, выйти
            </button>
            <button className="btn" onClick={() => setConfirm(false)}>
              Отмена
            </button>
          </>
        ) : (
          <button className="btn btn-danger-text" onClick={() => setConfirm(true)}>
            Выйти
          </button>
        )}
      </div>
      {confirm && (
        <p className="muted small">После выхода библиотека на этом устройстве очистится. В аккаунте она останется.</p>
      )}
    </>
  );
}

function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (action: () => Promise<string | void>) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (result) setMessage(result);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const valid = email.includes('@') && password.length >= 6;

  return (
    <>
      <p className="muted">
        Войдите, чтобы библиотека сохранялась в аккаунте и была одинаковой на телефоне, планшете и компьютере.
        Без входа всё работает, но только на этом устройстве.
      </p>
      <form
        className="authform"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => signIn(email, password));
        }}
      >
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          inputMode="email"
        />
        <input
          type="password"
          placeholder="Пароль (от 6 символов)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <div className="status-buttons">
          <button className="btn btn-primary" type="submit" disabled={busy || !valid}>
            Войти
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy || !valid}
            onClick={() =>
              void run(async () => {
                const r = await signUp(email, password);
                return r === 'confirm_email' ? 'Проверьте почту и подтвердите email, затем войдите.' : undefined;
              })
            }
          >
            Создать аккаунт
          </button>
        </div>
      </form>
      {message && <p className="muted small">{message}</p>}
    </>
  );
}
