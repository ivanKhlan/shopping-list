-- Схема «Списка покупок».
-- Доступ к таблицам только у серверной функции (service role): RLS включён,
-- политик нет, поэтому из браузера напрямую ничего прочитать нельзя.

create table public.families (
  id         text primary key,
  items      jsonb not null default '[]'::jsonb, -- весь список семьи одним документом
  version    integer not null default 0,         -- для защиты от одновременной записи
  created_at timestamptz not null default now()
);

create table public.members (
  user_id    bigint primary key,                 -- id пользователя Telegram
  family_id  text not null references public.families(id) on delete cascade,
  first_name text not null,
  username   text,
  photo_url  text,
  joined_at  bigint not null                     -- мс с 1970 года
);
create index members_family_idx on public.members(family_id);

create table public.invites (
  token      text primary key,
  family_id  text not null references public.families(id) on delete cascade,
  inviter_id bigint not null,
  created_at bigint not null,
  expires_at bigint not null,
  used_by    bigint
);

alter table public.families enable row level security;
alter table public.members  enable row level security;
alter table public.invites  enable row level security;

-- Старые приглашения не нужны: чистить можно вручную или по расписанию (pg_cron):
--   delete from public.invites where expires_at < (extract(epoch from now()) * 1000)::bigint - 7*24*3600*1000;
