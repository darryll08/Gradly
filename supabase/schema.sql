-- Gradly: follow-up per student + action history. Run in the Supabase SQL editor (safe to re-run).

-- Current state per student (one row each).
create table if not exists public.tindak_lanjut (
  student_id integer primary key,
  status text not null default 'belum' check (status in ('belum', 'dihubungi', 'didampingi', 'selesai')),
  note text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.tindak_lanjut add column if not exists konselor text;      -- assigned counsellor
alter table public.tindak_lanjut add column if not exists rencana jsonb;      -- saved what-if plan from the profile

-- Every action a counsellor takes (contact, WA template, referral, bulk campaign...), newest first in the UI.
create table if not exists public.aksi (
  id bigint generated always as identity primary key,
  student_id integer not null,
  jenis text not null,                -- e.g. 'wa', 'telepon', 'jadwal', 'remedial', 'status', 'massal'
  catatan text not null default '',
  konselor text,
  kampanye text,                      -- bulk action label, null for single actions
  created_at timestamptz not null default now()
);
create index if not exists aksi_student on public.aksi (student_id, created_at desc);

alter table public.tindak_lanjut enable row level security;
alter table public.aksi enable row level security;

-- Prototype policy: anyone with the anon key can read and write. Demo data only; replace with
-- auth-based policies (signed-in counsellors) before using real student data.
drop policy if exists "prototype read" on public.tindak_lanjut;
drop policy if exists "prototype write" on public.tindak_lanjut;
drop policy if exists "prototype update" on public.tindak_lanjut;
create policy "prototype read" on public.tindak_lanjut for select using (true);
create policy "prototype write" on public.tindak_lanjut for insert with check (true);
create policy "prototype update" on public.tindak_lanjut for update using (true);

drop policy if exists "prototype read" on public.aksi;
drop policy if exists "prototype write" on public.aksi;
create policy "prototype read" on public.aksi for select using (true);
create policy "prototype write" on public.aksi for insert with check (true);
