-- Push-уведомления: подписки устройств и функции для отправителя (scripts/send-push.mjs).
-- Выполнить один раз в Supabase: SQL Editor -> New query -> вставить весь файл -> Run.
-- Повторный запуск безопасен.
--
-- После этого задать общий секрет (та же строка пойдёт в GitHub Secrets как PUSH_SECRET):
--   insert into public.app_config (key, value) values ('push_secret', '<СЕКРЕТ>')
--   on conflict (key) do update set value = excluded.value;

-- Общие настройки сервера (секрет отправителя). Доступа через API нет ни у кого.
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

-- Подписки на уведомления. Одна строка = одно устройство (endpoint уникален у браузера).
create table if not exists public.push_subscriptions (
  endpoint   text        primary key,
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh     text        not null,
  auth       text        not null,
  episodes   boolean     not null default true,   -- присылать о новых сериях
  reminders  boolean     not null default true,   -- присылать напоминания вернуться
  created_at timestamptz not null default now()
);
create index if not exists push_sub_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

drop policy if exists "own subscriptions" on public.push_subscriptions;
create policy "own subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Что уже отправлено: чтобы одно и то же не слать дважды.
create table if not exists public.push_sent (
  endpoint text        not null,
  kind     text        not null,      -- 'ep' | 'remind'
  ref      text        not null,      -- 'tv:123:s2e5' или дата напоминания
  sent_at  timestamptz not null default now(),
  primary key (endpoint, kind, ref)
);
create index if not exists push_sent_at on public.push_sent (kind, sent_at);
alter table public.push_sent enable row level security;
revoke all on public.push_sent from anon, authenticated;

-- Проверка секрета отправителя. Вызывается только из функций ниже (под правами владельца).
create or replace function public.push_secret_ok(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_config
    where key = 'push_secret' and value = p and p is not null and length(p) >= 10
  );
$$;
revoke all on function public.push_secret_ok(text) from public, anon, authenticated;

-- Кому слать о новых сериях: по строке на каждый сериал «смотрю» у подписанных.
create or replace function public.push_episode_targets(p_secret text)
returns table (endpoint text, p256dh text, auth text, tv_id integer, title text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.push_secret_ok(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select s.endpoint, s.p256dh, s.auth, l.tmdb_id, l.data->>'title'
    from public.push_subscriptions s
    join public.library l on l.user_id = s.user_id
    where s.episodes
      and l.media_type = 'tv'
      and not l.deleted
      and l.data->>'status' = 'watching';
end;
$$;

-- Кому слать напоминание вернуться: нет активности p_days дней, есть недосмотренный сериал «смотрю»,
-- и напоминание не слали последние p_days дней.
create or replace function public.push_reminder_targets(p_secret text, p_days integer default 3)
returns table (endpoint text, p256dh text, auth text, title text, left_count integer)
language plpgsql stable security definer set search_path = public as $$
declare cutoff date := (now() at time zone 'Asia/Almaty')::date - greatest(coalesce(p_days, 3), 1);
begin
  if not public.push_secret_ok(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select d.endpoint, d.p256dh, d.auth, w.title, w.left_count
    from (
      select s.endpoint, s.p256dh, s.auth, s.user_id
      from public.push_subscriptions s
      where s.reminders
        and coalesce((select max(a.day) from public.activity a where a.user_id = s.user_id), date '2000-01-01') < cutoff
        and not exists (
          select 1 from public.push_sent ps
          where ps.endpoint = s.endpoint and ps.kind = 'remind'
            and ps.sent_at > now() - (greatest(coalesce(p_days, 3), 1) || ' days')::interval
        )
    ) d
    join lateral (
      select l.data->>'title' as title,
             coalesce((l.data->>'episodeCount')::int, 0) - coalesce((l.data->>'episodesWatched')::int, 0) as left_count
      from public.library l
      where l.user_id = d.user_id and l.media_type = 'tv' and not l.deleted
        and l.data->>'status' = 'watching'
        and coalesce((l.data->>'episodeCount')::int, 0) > coalesce((l.data->>'episodesWatched')::int, 0)
      order by l.updated_at desc
      limit 1
    ) w on true;
end;
$$;

-- Пометить отправленным и сказать, не слали ли это раньше (true = слать впервые).
create or replace function public.push_claim(p_secret text, p_endpoint text, p_kind text, p_ref text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.push_secret_ok(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.push_sent (endpoint, kind, ref) values (p_endpoint, p_kind, p_ref)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Отписать устройство, если его подписка больше не действует (ответ 404/410 при отправке).
create or replace function public.push_drop(p_secret text, p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.push_secret_ok(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  delete from public.push_sent where endpoint = p_endpoint;
end;
$$;

revoke all on function public.push_episode_targets(text) from public;
revoke all on function public.push_reminder_targets(text, integer) from public;
revoke all on function public.push_claim(text, text, text, text) from public;
revoke all on function public.push_drop(text, text) from public;
grant execute on function public.push_episode_targets(text) to anon, authenticated;
grant execute on function public.push_reminder_targets(text, integer) to anon, authenticated;
grant execute on function public.push_claim(text, text, text, text) to anon, authenticated;
grant execute on function public.push_drop(text, text) to anon, authenticated;
