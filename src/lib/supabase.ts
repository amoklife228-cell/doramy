import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const key = (import.meta.env.VITE_SUPABASE_KEY as string | undefined)?.trim() ?? '';

/** null, если проект собран без настроек Supabase: тогда аккаунтов и синхронизации нет. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
export const SYNC_AVAILABLE = supabase !== null;

/** undefined = ещё не узнали, null = не вошли. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => active && setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
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

export async function signIn(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Синхронизация недоступна в этой сборке.');
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(humanize(error.message));
}

export async function signUp(email: string, password: string): Promise<'signed_in' | 'confirm_email'> {
  if (!supabase) throw new Error('Синхронизация недоступна в этой сборке.');
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw new Error(humanize(error.message));
  return data.session ? 'signed_in' : 'confirm_email';
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(humanize(error.message));
}
