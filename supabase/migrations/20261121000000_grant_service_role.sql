-- Новые проекты Supabase не выдают права на таблицы автоматически.
-- Доступ нужен только серверной функции (роль service_role);
-- anon и authenticated по-прежнему не имеют доступа.
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.families, public.members, public.invites to service_role;
