import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { signIn, signOut, signUp, SYNC_AVAILABLE } from '../lib/supabase';
import { signOutAndClear, syncNow, useSyncState } from '../lib/sync';
import { IconColors, IosRow, IosSection, RowIcons } from '../components/IosList';

export function AccountSection({ session }: { session: Session | null | undefined }) {
  if (!SYNC_AVAILABLE) return null;
  if (session === undefined) {
    return (
      <IosSection title="Аккаунт">
        <IosRow icon={RowIcons.person} iconColor={IconColors.gray} label="Проверяем вход…" />
      </IosSection>
    );
  }
  return session ? <SignedIn session={session} /> : <SignInForm />;
}

function SignedIn({ session }: { session: Session }) {
  const sync = useSyncState();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const onSignOut = async () => {
    setBusy(true);
    setSignOutError(null);
    try {
      await signOutAndClear(session.user.id, signOut);
      setConfirm(false);
    } catch (e) {
      setSignOutError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const email = session.user.email ?? '';
  const when = sync.lastSync
    ? new Date(sync.lastSync).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : null;
  const syncText =
    sync.status === 'syncing'
      ? 'Синхронизация…'
      : sync.status === 'error'
        ? `Ошибка: ${sync.error}`
        : when
          ? `Синхронизировано в ${when}`
          : 'Готово к синхронизации';

  return (
    <>
      <IosSection title="Аккаунт" footer="Библиотека хранится в аккаунте и доступна на любом устройстве после входа.">
        <IosRow
          icon={<span className="ios-avatar">{email.slice(0, 1).toUpperCase() || '?'}</span>}
          label={email}
          sub={syncText}
        />
        <IosRow
          icon={RowIcons.sync}
          iconColor={IconColors.blue}
          label="Синхронизировать"
          disabled={sync.status === 'syncing'}
          onClick={() => void syncNow()}
        />
      </IosSection>
      <IosSection
        footer={
          signOutError ??
          (confirm ? 'После выхода библиотека на этом устройстве очистится. В аккаунте она останется.' : undefined)
        }
      >
        {confirm ? (
          <>
            <IosRow
              label={busy ? 'Отправляем изменения…' : 'Да, выйти'}
              destructive
              center
              disabled={busy}
              onClick={() => void onSignOut()}
            />
            <IosRow label="Отмена" accent center onClick={() => setConfirm(false)} />
          </>
        ) : (
          <IosRow label="Выйти" destructive center onClick={() => setConfirm(true)} />
        )}
      </IosSection>
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
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) void run(() => signIn(email, password));
      }}
    >
      <IosSection
        title="Аккаунт"
        footer={
          message ??
          'Войдите, чтобы библиотека сохранялась в аккаунте и была одинаковой на телефоне, планшете и компьютере. Без входа всё работает, но только на этом устройстве.'
        }
      >
        <IosRow label="Email">
          <input
            className="ios-input"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            inputMode="email"
          />
        </IosRow>
        <IosRow label="Пароль">
          <input
            className="ios-input"
            type="password"
            placeholder="от 6 символов"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </IosRow>
      </IosSection>
      <IosSection>
        <IosRow
          label={busy ? 'Подождите…' : 'Войти'}
          accent
          center
          disabled={busy || !valid}
          onClick={() => void run(() => signIn(email, password))}
        />
        <IosRow
          label="Создать аккаунт"
          center
          disabled={busy || !valid}
          onClick={() =>
            void run(async () => {
              const r = await signUp(email, password);
              return r === 'confirm_email' ? 'Проверьте почту и подтвердите email, затем войдите.' : undefined;
            })
          }
        />
      </IosSection>
      {/* Скрытая кнопка, чтобы Enter в поле отправлял форму */}
      <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
    </form>
  );
}
