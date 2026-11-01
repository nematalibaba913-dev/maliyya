-- ════════════════════════════════════════════════════════════
-- Maliyya — Supabase quraşdırma (v2)
-- Supabase → SQL Editor → New query → bütün faylı yapışdır → Run
-- Təkrar işlətmək təhlükəsizdir (mövcud cədvəl və siyasətləri silmir/yeniləyir).
--
-- ƏVVƏL: aşağıda OWNER_UID sözünü 2 yerdə öz istifadəçi ID-nizlə əvəz edin
--        (Authentication → Users → öz sətrinizdəki "UID", məs. 3f2c9e1a-....)
--        Dırnaqları saxlayın:  '3f2c9e1a-....'
-- ════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) INBOX — InputPad (girişsiz) buraya YALNIZ yazır
-- ─────────────────────────────────────────────────────────────
create table if not exists public.inbox (
  id          text primary key,                       -- InputPad-in yaratdığı unikal id (təkrar göndərmə təkrar sətir yaratmır)
  user_id     uuid not null default 'OWNER_UID'::uuid references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  tarix       text not null,
  emeliyyat   text not null,
  kateqoriya  text not null,
  qeyd        text not null default '',
  mebleg      text not null,
  source      text not null default 'inputpad_mobile',
  status      text not null default 'new',            -- 'new' | 'processed'
  -- Kənar adamın zibil yazmasını məhdudlaşdıran yoxlamalar:
  constraint inbox_id_len      check (char_length(id) between 5 and 64),
  constraint inbox_tarix_fmt   check (tarix ~ '^\d{4}-\d{2}-\d{2}$'),
  constraint inbox_emel_vals   check (emeliyyat in ('Xərc','Gəlir')),
  constraint inbox_kat_len     check (char_length(kateqoriya) between 1 and 60),
  constraint inbox_qeyd_len    check (char_length(qeyd) <= 120),
  constraint inbox_mebleg_fmt  check (mebleg ~ '^\d{1,9}(\.\d{1,2})?$'),
  constraint inbox_source_len  check (char_length(source) <= 40)
);

create index if not exists inbox_status_idx on public.inbox (user_id, status, created_at);

alter table public.inbox enable row level security;

-- Anonim (girişsiz) istifadəçi: yalnız əlavə edə bilər, və yalnız sizin hesab üçün, status=new
drop policy if exists "inbox_anon_insert" on public.inbox;
create policy "inbox_anon_insert" on public.inbox
  for insert to anon
  with check (user_id = 'OWNER_UID'::uuid and status = 'new');

-- Giriş etmiş siz: oxu / yenilə / sil
drop policy if exists "inbox_owner_all" on public.inbox;
create policy "inbox_owner_all" on public.inbox
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.inbox from anon;
grant insert on public.inbox to anon;
-- Bu layihədə cədvəllərə rollara avtomatik icazə verilmir — giriş etmiş siz üçün açıq veririk:
grant select, insert, update, delete on public.inbox to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2) APP_KV — əsas tətbiqin bütün datası (log, kredit, borc, proqnoz...)
--    Brauzer yaddaşının güzgüsü: telefon və PC eyni cədvəldən oxuyur
-- ─────────────────────────────────────────────────────────────
create table if not exists public.app_kv (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key         text not null,
  value       text,                                   -- JSON mətn kimi; null = silinib
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists app_kv_updated_at on public.app_kv;
create trigger app_kv_updated_at before update on public.app_kv
  for each row execute function public.set_updated_at();

alter table public.app_kv enable row level security;

drop policy if exists "app_kv_own" on public.app_kv;
create policy "app_kv_own" on public.app_kv
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.app_kv from anon;
grant select, insert, update, delete on public.app_kv to authenticated;
