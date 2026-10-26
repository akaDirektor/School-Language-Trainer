-- Run ONLY in the new School-Language-Trainer project. No existing project is used.
begin;
create table public.school_accounts (
  user_id uuid primary key references auth.users(id),
  student_id uuid not null references auth.users(id),
  role text not null check (role in ('student','parent')),
  check (role <> 'student' or user_id = student_id)
);
create table public.school_progress (
  user_id uuid primary key references auth.users(id),
  revision bigint not null default 0 check (revision >= 0),
  state jsonb not null check (state->>'schema' = '1' and jsonb_typeof(state->'languages') = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.school_accounts enable row level security;
alter table public.school_progress enable row level security;
revoke all on public.school_accounts, public.school_progress from anon, authenticated;
grant select on public.school_accounts, public.school_progress to authenticated;
create policy own_school_account on public.school_accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy assigned_school_progress on public.school_progress for select to authenticated
  using (user_id = (select student_id from public.school_accounts where user_id = (select auth.uid())));
create function public.save_school_progress(expected_revision bigint, next_state jsonb)
returns setof public.school_progress language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not exists(select 1 from public.school_accounts a where a.user_id=uid and a.student_id=uid and a.role='student') then
    raise exception 'Student access required';
  end if;
  if expected_revision = -1 then
    return query insert into public.school_progress(user_id,state) values(uid,next_state)
      on conflict do nothing returning *;
  else
    return query update public.school_progress set state=next_state, revision=revision+1, updated_at=now()
      where user_id=uid and revision=expected_revision returning *;
  end if;
end $$;
revoke all on function public.save_school_progress(bigint,jsonb) from public, anon;
grant execute on function public.save_school_progress(bigint,jsonb) to authenticated;
commit;
-- After creating two confirmed email/password users in Authentication > Users,
-- run this separately with their real UUIDs. Never put passwords in the repository.
-- insert into public.school_accounts(user_id,student_id,role) values
-- ('STUDENT_UUID','STUDENT_UUID','student'),
-- ('PARENT_UUID','STUDENT_UUID','parent');
