-- Maliyyə: 1-ci mərhələ cədvəlləri
-- Supabase → SQL Editor → New query → bütün faylı yapışdır → Run
-- Təkrar işlətmək təhlükəsizdir (mövcud cədvəl və siyasətləri silmir).

-- ── Ümumi log ────────────────────────────────────────────────
create table if not exists public.transactions (
  id          uuid primary key,                       -- cihaz yaradır, oflayn təkrar göndərmə təkrar sətir yaratmır
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tarix       date not null,
  tip         text not null check (tip in ('Gəlir','Xərc')),
  kateqoriya  text not null,
  qeyd        text not null default '',
  mebleg      numeric(12,2) not null check (mebleg > 0),
  menbe       text not null default 'log',            -- giris | log | kredit | borc
  ref_tip     text,                                   -- sonrakı mərhələlər: əlaqəli kredit/borc
  ref_id      uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz                             -- silinmə = bu sahə dolur (geri qayıtmır)
);

create index if not exists transactions_user_tarix_idx
  on public.transactions (user_id, tarix desc)
  where deleted_at is null;

-- ── Parametrlər (kateqoriya siyahısı, başlanğıc qalıq və s.) ─
create table if not exists public.settings (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key         text not null,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

-- ── updated_at avtomatik ─────────────────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists transactions_updated_at on public.transactions;
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

drop trigger if exists settings_updated_at on public.settings;
create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ── Təhlükəsizlik: hər kəs yalnız öz sətirlərini görür ──────
alter table public.transactions enable row level security;
alter table public.settings     enable row level security;

drop policy if exists "transactions_own" on public.transactions;
create policy "transactions_own" on public.transactions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "settings_own" on public.settings;
create policy "settings_own" on public.settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Giriş etməmiş (anon) istifadəçiyə heç bir hüquq verilmir
revoke all on public.transactions from anon;
revoke all on public.settings     from anon;

-- ── Canlı yenilənmə (telefondan girilən PC-də dərhal görünür) ─
do $$
begin
  alter publication supabase_realtime add table public.transactions;
exception when duplicate_object then null;
end $$;
