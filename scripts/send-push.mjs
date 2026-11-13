/**
 * Отправка push-уведомлений. Запускается по расписанию в GitHub Actions (.github/workflows/notify.yml),
 * потому что когда приложение закрыто, само устройство ничего не шлёт.
 *
 * Что делает:
 *  1. Берёт у Supabase список подписок и сериалов «смотрю» (функция push_episode_targets).
 *  2. Для каждого сериала спрашивает TMDB про последнюю вышедшую серию; если она вышла на днях —
 *     шлёт уведомление тем, кто этот сериал смотрит и ещё не получал про эту серию.
 *  3. Берёт тех, кто давно не заходил (push_reminder_targets), и шлёт напоминание про недосмотренное.
 *
 * Секреты (переменные окружения в Actions): PUSH_SECRET, VAPID_PRIVATE, VAPID_PUBLIC, VAPID_SUBJECT.
 * Адрес Supabase, его публичный ключ и ключ TMDB берутся из .env в репозитории.
 *
 * Логика вынесена в makeSender(), чтобы её можно было проверить с подставными зависимостями.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

export function makeSender({ supabaseUrl, supabaseKey, tmdbKey, tmdbBase, secret, webpush, fetchFn = fetch, now = () => new Date() }) {
  async function rpc(fn, args) {
    const res = await fetchFn(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`);
    return res.json();
  }

  const claim = (endpoint, kind, ref) => rpc('push_claim', { p_secret: secret, p_endpoint: endpoint, p_kind: kind, p_ref: ref });
  const drop = (endpoint) => rpc('push_drop', { p_secret: secret, p_endpoint: endpoint }).catch(() => {});

  let sent = 0;
  let failed = 0;

  async function send(t, payload) {
    try {
      await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, JSON.stringify(payload));
      sent++;
    } catch (e) {
      failed++;
      if (e.statusCode === 404 || e.statusCode === 410) await drop(t.endpoint);
      else console.error('send:', e.statusCode, e.body ?? e.message);
    }
  }

  async function episodes() {
    const targets = await rpc('push_episode_targets', { p_secret: secret });
    const byShow = new Map();
    for (const t of targets) {
      if (!byShow.has(t.tv_id)) byShow.set(t.tv_id, []);
      byShow.get(t.tv_id).push(t);
    }
    const today = now();
    const twoDaysAgo = new Date(today.getTime() - 2 * 86400000);

    for (const [tvId, list] of byShow) {
      let last;
      try {
        const r = await fetchFn(`${tmdbBase}/tv/${tvId}?api_key=${tmdbKey}&language=ru-RU`);
        if (!r.ok) continue;
        last = (await r.json()).last_episode_to_air;
      } catch {
        continue;
      }
      if (!last || !last.air_date) continue;
      const air = new Date(last.air_date + 'T00:00:00');
      if (air > today || air < twoDaysAgo) continue; // вышла не в последние пару дней
      const ref = `tv:${tvId}:s${last.season_number}e${last.episode_number}`;
      const where = last.season_number > 1 ? `Сезон ${last.season_number}, серия ${last.episode_number}` : `Серия ${last.episode_number}`;
      for (const t of list) {
        if (!(await claim(t.endpoint, 'ep', ref))) continue;
        await send(t, {
          title: t.title || 'Новая серия',
          body: last.name ? `${where}: «${last.name}»` : `${where} уже вышла`,
          url: `/doramy/#/tv/${tvId}`,
          tag: ref,
        });
      }
    }
  }

  async function reminders() {
    const targets = await rpc('push_reminder_targets', { p_secret: secret, p_days: 3 });
    const day = now().toISOString().slice(0, 10);
    for (const t of targets) {
      if (!(await claim(t.endpoint, 'remind', day))) continue;
      const left = t.left_count ?? 0;
      const tail = left > 0 ? ` — осталось ${left} ${plural(left, 'серия', 'серии', 'серий')}` : '';
      await send(t, {
        title: 'Давно не заходили',
        body: t.title ? `Вы остановились на «${t.title}»${tail}` : 'Продолжите смотреть то, что начали',
        url: '/doramy/#/library',
        tag: 'remind',
      });
    }
  }

  async function run() {
    await episodes();
    await reminders();
    return { sent, failed };
  }

  return { run, episodes, reminders };
}

/* ---------- запуск из командной строки ---------- */

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const file = {};
  try {
    for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) file[m[1]] = m[2];
    }
  } catch {
    // нет файла — всё из окружения
  }

  const cfg = {
    supabaseUrl: process.env.VITE_SUPABASE_URL || file.VITE_SUPABASE_URL,
    supabaseKey: process.env.VITE_SUPABASE_KEY || file.VITE_SUPABASE_KEY,
    tmdbKey: process.env.VITE_TMDB_KEY || file.VITE_TMDB_KEY,
    tmdbBase: process.env.TMDB_BASE || 'https://api.themoviedb.org/3',
    secret: process.env.PUSH_SECRET,
    vapidPublic: process.env.VAPID_PUBLIC || file.VITE_VAPID_PUBLIC,
    vapidPrivate: process.env.VAPID_PRIVATE,
    vapidSubject: process.env.VAPID_SUBJECT || 'mailto:doramy@example.com',
  };

  for (const name of ['supabaseUrl', 'supabaseKey', 'tmdbKey', 'secret', 'vapidPublic', 'vapidPrivate']) {
    if (!cfg[name]) {
      console.error(`Нет обязательной переменной (${name}). Отправка пропущена.`);
      return;
    }
  }

  const { default: webpush } = await import('web-push');
  webpush.setVapidDetails(cfg.vapidSubject, cfg.vapidPublic, cfg.vapidPrivate);

  const sender = makeSender({ ...cfg, webpush });
  try {
    const { sent, failed } = await sender.run();
    console.log(`Готово: отправлено ${sent}, не удалось ${failed}.`);
  } catch (e) {
    console.error('Сбой отправки:', e.message);
  }
}

// Запускаем, только если файл вызван напрямую (а не импортирован в тесте).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
