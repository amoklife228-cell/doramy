import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const key = (import.meta.env.VITE_SUPABASE_KEY as string | undefined)?.trim() ?? '';

/** false, если проект собран без настроек Supabase: тогда аккаунтов и синхронизации нет. */
export const SYNC_AVAILABLE = !!(url && key);

/*
 * Библиотека Supabase весит ~45 КБ gzip и не нужна для первого кадра, поэтому грузится отдельным
 * чанком при первом обращении. Клиент один на приложение.
 */
let client: SupabaseClient | null = null;
let clientPromise: Promise<SupabaseClient | null> | null = null;
const readyListeners = new Set<(c: SupabaseClient) => void>();

/** Клиент Supabase; null, если синхронизация в этой сборке выключена. */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!SYNC_AVAILABLE) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(
      ({ createClient }) => {
        const c = createClient(url, key);
        client = c;
        readyListeners.forEach((l) => l(c));
        return c;
      },
      (e: unknown) => {
        // Чанк не загрузился (нет сети и нет кэша): дать следующему вызову попробовать снова.
        clientPromise = null;
        throw e;
      },
    );
  }
  return clientPromise;
}

/**
 * Есть ли признаки входа без загрузки библиотеки: сохранённая сессия в localStorage
 * (ключ sb-<проект>-auth-token) или ответ сервера авторизации в адресе после перехода по ссылке из письма.
 */
function mayHaveSession(): boolean {
  try {
    const h = location.hash + location.search;
    if (/[#&?](access_token|refresh_token|error_description|code)=/.test(h)) return true;
  } catch {
    // ignore
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^sb-.+-auth-token$/.test(k)) return true;
    }
    return false;
  } catch {
    // localStorage недоступен: не гадаем, спрашиваем библиотеку.
    return true;
  }
}

/** undefined = ещё не узнали, null = не вошли. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(() =>
    SYNC_AVAILABLE && (client !== null || mayHaveSession()) ? undefined : null,
  );
  useEffect(() => {
    if (!SYNC_AVAILABLE) return;
    let active = true;
    let unsubscribe: (() => void) | null = null;
    const attach = (c: SupabaseClient) => {
      if (!active || unsubscribe) return;
      void c.auth.getSession().then(({ data }) => active && setSession(data.session));
      const { data: sub } = c.auth.onAuthStateChange((_event, s) => active && setSession(s));
      unsubscribe = () => sub.subscription.unsubscribe();
    };
    if (client) {
      attach(client);
    } else {
      // Без признаков входа библиотеку не грузим: подпишемся, когда её загрузит вход или синхронизация.
      readyListeners.add(attach);
      if (mayHaveSession()) void getSupabase().catch(() => undefined);
    }
    return () => {
      active = false;
      readyListeners.delete(attach);
      unsubscribe?.();
    };
  }, []);
  return session;
}

function humanize(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Неверный email или пароль.';
  if (m.includes('already registered') || m.includes('already exists')) return 'Такой аккаунт уже есть. Нажмите «Войти».';
  if (m.includes('password should be at least')) return 'Пароль должен быть не короче 6 символов.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'Проверьте адрес email.';
  if (m.includes('email not confirmed')) return 'Email не подтверждён. Проверьте почту.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Слишком много попыток. Подождите минуту.';
  if (m.includes('fetch') || m.includes('network')) return 'Нет соединения. Проверьте интернет.';
  return message;
}

/** Клиент для входа/выхода; ошибка загрузки чанка превращается в понятное сообщение. */
async function requireClient(): Promise<SupabaseClient | null> {
  try {
    return await getSupabase();
  } catch {
    throw new Error('Нет соединения. Проверьте интернет.');
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const supabase = await requireClient();
  if (!supabase) throw new Error('Синхронизация недоступна в этой сборке.');
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(humanize(error.message));
}

export async function signUp(email: string, password: string): Promise<'signed_in' | 'confirm_email'> {
  const supabase = await requireClient();
  if (!supabase) throw new Error('Синхронизация недоступна в этой сборке.');
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw new Error(humanize(error.message));
  return data.session ? 'signed_in' : 'confirm_email';
}

export async function signOut(): Promise<void> {
  if (!SYNC_AVAILABLE) return;
  const supabase = await requireClient();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(humanize(error.message));
}
