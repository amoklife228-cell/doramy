-- Админ-панель: учёт заходов и функции только для администратора.
-- Выполнить один раз в Supabase: SQL Editor -> New query -> вставить весь файл -> Run.
-- Повторный запуск безопасен.
--
-- Себя администратором назначить отдельной строкой (её показывает экран #/admin в приложении):
--   insert into public.admins (user_id) values ('<ваш id>') on conflict do nothing;

-- Администраторы. Политик нет: через API таблицу не читает и не меняет никто,
-- её проверяют только функции ниже.
create table if not exists public.admins (
  user_id  uuid        primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Заходы: одна строка = одно устройство за один день (по времени Казахстана).
-- device_id — случайный id, который приложение создаёт на устройстве; никаких личных данных.
create table if not exists public.visits (
  device_id  uuid        not null,
  day        date        not null,
  user_id    uuid        references auth.users (id) on delete set null,
  opens      integer     not null default 0,
  actions    integer     not null default 0,
  platform   text,
  standalone boolean     not null default false,
  first_at   timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  primary key (device_id, day)
);
create index if not exists visits_day on public.visits (day);
create index if not exists visits_user on public.visits (user_id);
alter table public.visits enable row level security;
revoke all on public.visits from anon, authenticated;

-- Приложение сообщает о заходах только через эту функцию: прочитать чужие строки через неё нельзя.
create or replace function public.track_visit(
  p_device uuid, p_opens integer, p_actions integer, p_platform text, p_standalone boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  d date := (now() at time zone 'Asia/Almaty')::date;
begin
  if p_device is null
     or coalesce(p_opens, -1) not between 0 and 100
     or coalesce(p_actions, -1) not between 0 and 1000 then
    return;
  end if;
  insert into public.visits as v (device_id, day, user_id, opens, actions, platform, standalone)
  values (p_device, d, auth.uid(), p_opens, p_actions, left(p_platform, 20), coalesce(p_standalone, false))
  on conflict (device_id, day) do update set
    opens      = v.opens + excluded.opens,
    actions    = v.actions + excluded.actions,
    user_id    = coalesce(excluded.user_id, v.user_id),
    platform   = excluded.platform,
    standalone = v.standalone or excluded.standalone,
    last_at    = now();
end;
$$;
revoke all on function public.track_visit(uuid, integer, integer, text, boolean) from public;
grant execute on function public.track_visit(uuid, integer, integer, text, boolean) to anon, authenticated;

-- Сводка: числа и график по дням.
create or replace function public.admin_overview(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare
  today date := (now() at time zone 'Asia/Almaty')::date;
  n integer := least(greatest(coalesce(p_days, 30), 7), 120);
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'today',        today,
    'users',        (select count(*) from auth.users),
    'users_new_7',  (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'devices_today',(select count(distinct device_id) from public.visits where day = today),
    'devices_7',    (select count(distinct device_id) from public.visits where day > today - 7),
    'devices_30',   (select count(distinct device_id) from public.visits where day > today - 30),
    'devices_all',  (select count(distinct device_id) from public.visits),
    'new_devices_7',(select count(*) from (select device_id from public.visits group by device_id having min(day) > today - 7) s),
    'installed_30', (select count(distinct device_id) from public.visits where standalone and day > today - 30),
    'opens_today',  (select coalesce(sum(opens), 0) from public.visits where day = today),
    'units_7',      (select coalesce(sum(units), 0) from public.activity where day > today - 7),
    'titles',       (select count(*) from public.library where not deleted),
    'platforms',    (select coalesce(jsonb_object_agg(p, c), '{}'::jsonb) from (
                       select coalesce(platform, 'Другое') p, count(distinct device_id) c
                       from public.visits where day > today - 30 group by 1) s),
    'days',         (select coalesce(jsonb_agg(jsonb_build_object(
                         'day', g.day,
                         'devices', (select count(distinct device_id) from public.visits v where v.day = g.day),
                         'opens',   (select coalesce(sum(opens), 0) from public.visits v where v.day = g.day),
                         'actions', (select coalesce(sum(actions), 0) from public.visits v where v.day = g.day),
                         'units',   (select coalesce(sum(units), 0) from public.activity a where a.day = g.day)
                       ) order by g.day), '[]'::jsonb)
                     from (select (today - i) as day from generate_series(0, n - 1) i) g)
  ) into r;
  return r;
end;
$$;

-- Все аккаунты с короткой статистикой.
create or replace function public.admin_users() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare r jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(u order by last_seen desc nulls last), '[]'::jsonb) into r
  from (
    select
      greatest(
        (select max(v.last_at) from public.visits v where v.user_id = au.id),
        (select max(l.updated_at) from public.library l where l.user_id = au.id),
        au.last_sign_in_at
      ) as last_seen,
      jsonb_build_object(
        'id', au.id,
        'email', au.email,
        'created_at', au.created_at,
        'last_sign_in_at', au.last_sign_in_at,
        'last_seen', greatest(
          (select max(v.last_at) from public.visits v where v.user_id = au.id),
          (select max(l.updated_at) from public.library l where l.user_id = au.id),
          au.last_sign_in_at),
        'titles',    (select count(*) from public.library l where l.user_id = au.id and not l.deleted),
        'watching',  (select count(*) from public.library l where l.user_id = au.id and not l.deleted and l.data->>'status' = 'watching'),
        'completed', (select count(*) from public.library l where l.user_id = au.id and not l.deleted and l.data->>'status' = 'completed'),
        'units',     (select coalesce(sum(a.units), 0) from public.activity a where a.user_id = au.id),
        'minutes',   (select coalesce(sum(a.minutes), 0) from public.activity a where a.user_id = au.id),
        'devices',   (select count(distinct v.device_id) from public.visits v where v.user_id = au.id),
        'is_admin',  exists (select 1 from public.admins ad where ad.user_id = au.id)
      ) as u
    from auth.users au
  ) s;
  return r;
end;
$$;

-- Один человек: его библиотека и активность по дням.
create or replace function public.admin_user(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare r jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'library', (select coalesce(jsonb_agg(jsonb_build_object(
                   'key', l.key,
                   'media_type', l.media_type,
                   'tmdb_id', l.tmdb_id,
                   'title', l.data->>'title',
                   'poster', l.data->>'posterPath',
                   'status', l.data->>'status',
                   'episodes', l.data->'episodesWatched',
                   'episode_count', l.data->'episodeCount',
                   'rating', l.data->'userRating',
                   'favorite', l.data->'isFavorite',
                   'review', l.data->>'review',
                   'updated_at', l.updated_at
                 ) order by l.updated_at desc), '[]'::jsonb)
               from public.library l where l.user_id = p_user and not l.deleted),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object('day', a.day, 'units', a.units, 'minutes', a.minutes)
                   order by a.day desc), '[]'::jsonb)
                 from (select * from public.activity where user_id = p_user order by day desc limit 90) a)
  ) into r;
  return r;
end;
$$;

-- Лента: последние изменения в библиотеках всех пользователей.
create or replace function public.admin_feed(p_limit integer default 80) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare r jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(x order by t desc), '[]'::jsonb) into r
  from (
    select l.updated_at as t, jsonb_build_object(
      'user_id', l.user_id,
      'email', au.email,
      'media_type', l.media_type,
      'tmdb_id', l.tmdb_id,
      'title', l.data->>'title',
      'poster', l.data->>'posterPath',
      'status', l.data->>'status',
      'episodes', l.data->'episodesWatched',
      'episode_count', l.data->'episodeCount',
      'deleted', l.deleted,
      'updated_at', l.updated_at
    ) as x
    from public.library l
    join auth.users au on au.id = l.user_id
    order by l.updated_at desc
    limit least(greatest(coalesce(p_limit, 80), 1), 300)
  ) s;
  return r;
end;
$$;

revoke all on function public.admin_overview(integer) from public, anon;
revoke all on function public.admin_users() from public, anon;
revoke all on function public.admin_user(uuid) from public, anon;
revoke all on function public.admin_feed(integer) from public, anon;
grant execute on function public.admin_overview(integer) to authenticated;
grant execute on function public.admin_users() to authenticated;
grant execute on function public.admin_user(uuid) to authenticated;
grant execute on function public.admin_feed(integer) to authenticated;
