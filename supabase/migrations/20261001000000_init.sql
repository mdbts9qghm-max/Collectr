-- Collectr: Grundschema (Phase 4)
-- Eine Tabelle pro Sammlung, synchronisiert mit dem lokalen Speicher (IndexedDB) der App.
-- Jede Zeile gehört genau einem Nutzer; Row Level Security erlaubt nur Zugriff auf eigene Zeilen.
-- Löschungen sind Tombstones (deleted = true), damit andere Geräte sie beim Abruf mitbekommen.

-- updated_at wird serverseitig gesetzt; er dient der App als Abruf-Cursor.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create table public.settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
comment on table public.settings is 'Einstellungen (Profil, Ankerdatum, Gewichte, Demo, Urlaubs-Bestätigung)';
create index settings_user_updated_idx on public.settings (user_id, updated_at);
create trigger settings_set_updated_at before insert or update on public.settings
  for each row execute function public.set_updated_at();
alter table public.settings enable row level security;
alter table public.settings force row level security;
create policy "settings: eigene Zeilen lesen" on public.settings for select to authenticated using (user_id = (select auth.uid()));
create policy "settings: eigene Zeilen anlegen" on public.settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy "settings: eigene Zeilen ändern" on public.settings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "settings: eigene Zeilen löschen" on public.settings for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.settings from anon;
grant select, insert, update, delete on public.settings to authenticated;

create table public.shift_overrides (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
comment on table public.shift_overrides is 'Schicht-Overrides (V, Urlaub, Krank, Tausch, Überstunden, Fortbildung)';
create index shift_overrides_user_updated_idx on public.shift_overrides (user_id, updated_at);
create trigger shift_overrides_set_updated_at before insert or update on public.shift_overrides
  for each row execute function public.set_updated_at();
alter table public.shift_overrides enable row level security;
alter table public.shift_overrides force row level security;
create policy "shift_overrides: eigene Zeilen lesen" on public.shift_overrides for select to authenticated using (user_id = (select auth.uid()));
create policy "shift_overrides: eigene Zeilen anlegen" on public.shift_overrides for insert to authenticated with check (user_id = (select auth.uid()));
create policy "shift_overrides: eigene Zeilen ändern" on public.shift_overrides for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "shift_overrides: eigene Zeilen löschen" on public.shift_overrides for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.shift_overrides from anon;
grant select, insert, update, delete on public.shift_overrides to authenticated;

create table public.session_logs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, session_id)
);
comment on table public.session_logs is 'Tracking der Einheiten';
create index session_logs_user_updated_idx on public.session_logs (user_id, updated_at);
create trigger session_logs_set_updated_at before insert or update on public.session_logs
  for each row execute function public.set_updated_at();
alter table public.session_logs enable row level security;
alter table public.session_logs force row level security;
create policy "session_logs: eigene Zeilen lesen" on public.session_logs for select to authenticated using (user_id = (select auth.uid()));
create policy "session_logs: eigene Zeilen anlegen" on public.session_logs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "session_logs: eigene Zeilen ändern" on public.session_logs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "session_logs: eigene Zeilen löschen" on public.session_logs for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.session_logs from anon;
grant select, insert, update, delete on public.session_logs to authenticated;

create table public.manual_readiness (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
comment on table public.manual_readiness is 'Manuelle Erholungseingabe';
create index manual_readiness_user_updated_idx on public.manual_readiness (user_id, updated_at);
create trigger manual_readiness_set_updated_at before insert or update on public.manual_readiness
  for each row execute function public.set_updated_at();
alter table public.manual_readiness enable row level security;
alter table public.manual_readiness force row level security;
create policy "manual_readiness: eigene Zeilen lesen" on public.manual_readiness for select to authenticated using (user_id = (select auth.uid()));
create policy "manual_readiness: eigene Zeilen anlegen" on public.manual_readiness for insert to authenticated with check (user_id = (select auth.uid()));
create policy "manual_readiness: eigene Zeilen ändern" on public.manual_readiness for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "manual_readiness: eigene Zeilen löschen" on public.manual_readiness for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.manual_readiness from anon;
grant select, insert, update, delete on public.manual_readiness to authenticated;

create table public.strength_tests (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
comment on table public.strength_tests is 'Krafttests';
create index strength_tests_user_updated_idx on public.strength_tests (user_id, updated_at);
create trigger strength_tests_set_updated_at before insert or update on public.strength_tests
  for each row execute function public.set_updated_at();
alter table public.strength_tests enable row level security;
alter table public.strength_tests force row level security;
create policy "strength_tests: eigene Zeilen lesen" on public.strength_tests for select to authenticated using (user_id = (select auth.uid()));
create policy "strength_tests: eigene Zeilen anlegen" on public.strength_tests for insert to authenticated with check (user_id = (select auth.uid()));
create policy "strength_tests: eigene Zeilen ändern" on public.strength_tests for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "strength_tests: eigene Zeilen löschen" on public.strength_tests for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.strength_tests from anon;
grant select, insert, update, delete on public.strength_tests to authenticated;

create table public.strength_state (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
comment on table public.strength_state is 'Aktueller Kraftstand';
create index strength_state_user_updated_idx on public.strength_state (user_id, updated_at);
create trigger strength_state_set_updated_at before insert or update on public.strength_state
  for each row execute function public.set_updated_at();
alter table public.strength_state enable row level security;
alter table public.strength_state force row level security;
create policy "strength_state: eigene Zeilen lesen" on public.strength_state for select to authenticated using (user_id = (select auth.uid()));
create policy "strength_state: eigene Zeilen anlegen" on public.strength_state for insert to authenticated with check (user_id = (select auth.uid()));
create policy "strength_state: eigene Zeilen ändern" on public.strength_state for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "strength_state: eigene Zeilen löschen" on public.strength_state for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.strength_state from anon;
grant select, insert, update, delete on public.strength_state to authenticated;

create table public.checklist (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
comment on table public.checklist is 'Checkliste Rennwoche';
create index checklist_user_updated_idx on public.checklist (user_id, updated_at);
create trigger checklist_set_updated_at before insert or update on public.checklist
  for each row execute function public.set_updated_at();
alter table public.checklist enable row level security;
alter table public.checklist force row level security;
create policy "checklist: eigene Zeilen lesen" on public.checklist for select to authenticated using (user_id = (select auth.uid()));
create policy "checklist: eigene Zeilen anlegen" on public.checklist for insert to authenticated with check (user_id = (select auth.uid()));
create policy "checklist: eigene Zeilen ändern" on public.checklist for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "checklist: eigene Zeilen löschen" on public.checklist for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.checklist from anon;
grant select, insert, update, delete on public.checklist to authenticated;

create table public.adjustment_decisions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, session_id)
);
comment on table public.adjustment_decisions is 'Abgelehnte Anpassungen (Original ausgeführt)';
create index adjustment_decisions_user_updated_idx on public.adjustment_decisions (user_id, updated_at);
create trigger adjustment_decisions_set_updated_at before insert or update on public.adjustment_decisions
  for each row execute function public.set_updated_at();
alter table public.adjustment_decisions enable row level security;
alter table public.adjustment_decisions force row level security;
create policy "adjustment_decisions: eigene Zeilen lesen" on public.adjustment_decisions for select to authenticated using (user_id = (select auth.uid()));
create policy "adjustment_decisions: eigene Zeilen anlegen" on public.adjustment_decisions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "adjustment_decisions: eigene Zeilen ändern" on public.adjustment_decisions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "adjustment_decisions: eigene Zeilen löschen" on public.adjustment_decisions for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.adjustment_decisions from anon;
grant select, insert, update, delete on public.adjustment_decisions to authenticated;
