-- Админы: флаг в profiles (выдаётся вручную через SQL или через API сервера с service role)
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Нельзя самому выдать себе админку с клиента: менять is_admin может только service_role (сервер Render)
create or replace function public.protect_profiles_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text;
begin
  jwt_role := coalesce(nullif(trim(current_setting('request.jwt.claim.role', true)), ''), '');
  if TG_OP = 'UPDATE' and NEW.is_admin is distinct from OLD.is_admin then
    if jwt_role is distinct from 'service_role' then
      NEW.is_admin := OLD.is_admin;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_profiles_protect_is_admin on public.profiles;
create trigger trg_profiles_protect_is_admin
before update on public.profiles
for each row
execute function public.protect_profiles_is_admin();

-- Выдать админку выбранному аккаунту (SQL Editor, подставь UUID из Authentication → Users):
-- update public.profiles set is_admin = true where id = 'cb042608-690e-4f2a-a47c-d6e7a0442971';
