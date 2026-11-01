-- Maliyya — inbox cədvəli (mobil InputPad → PC log)
-- Supabase → SQL Editor → New query → bütün faylı yapışdır → Run
-- Təkrar işlətmək təhlükəsizdir.

create table if not exists public.inbox (
  id          text primary key,                 -- InputPad-in yaratdığı unikal id
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  tarix       text,
  emeliyyat   text,                             -- 'Xərc' | 'Gəlir'
  kateqoriya  text,
  qeyd        text,
  mebleg      text,
  source      text default 'inputpad_mobile',
  status      text not null default 'new'       -- 'new' | 'processed'
);

create index if not exists inbox_user_status_idx on public.inbox (user_id, status, created_at);

alter table public.inbox enable row level security;

drop policy if exists "inbox_own" on public.inbox;
create policy "inbox_own" on public.inbox
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.inbox from anon;
