-- Collectr: WHOOP-Anbindung (Phase 5)
-- Tokens und OAuth-States sind nur für die Service Role (Edge Functions) zugänglich: RLS an, keine Policy.
-- WHOOP-Daten schreiben nur die Edge Functions; der Nutzer darf die eigenen Zeilen lesen.

create table public.whoop_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  whoop_user_id bigint,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  updated_at timestamptz not null default now()
);
comment on table public.whoop_tokens is 'WHOOP OAuth-Tokens – nur serverseitig (Service Role)';
alter table public.whoop_tokens enable row level security;
alter table public.whoop_tokens force row level security;
revoke all on public.whoop_tokens from anon, authenticated;

create table public.whoop_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);
comment on table public.whoop_oauth_states is 'Einmalige OAuth-States (10 min) – nur serverseitig';
alter table public.whoop_oauth_states enable row level security;
alter table public.whoop_oauth_states force row level security;
revoke all on public.whoop_oauth_states from anon, authenticated;

create table public.whoop_status (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  key text not null default 'whoop',
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
comment on table public.whoop_status is 'Verbindungsstatus (ohne Tokens), für die App lesbar';
create trigger whoop_status_set_updated_at before insert or update on public.whoop_status
  for each row execute function public.set_updated_at();
alter table public.whoop_status enable row level security;
alter table public.whoop_status force row level security;
create policy "whoop_status: eigene Zeile lesen" on public.whoop_status for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.whoop_status from anon;
revoke insert, update, delete on public.whoop_status from authenticated;
grant select on public.whoop_status to authenticated;

create table public.whoop_cycles (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  raw jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
comment on table public.whoop_cycles is 'WHOOP-Zyklen (Strain) – normalisiert (data) und Rohdaten (raw)';
create index whoop_cycles_user_updated_idx on public.whoop_cycles (user_id, updated_at);
create trigger whoop_cycles_set_updated_at before insert or update on public.whoop_cycles
  for each row execute function public.set_updated_at();
alter table public.whoop_cycles enable row level security;
alter table public.whoop_cycles force row level security;
create policy "whoop_cycles: eigene Zeilen lesen" on public.whoop_cycles for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.whoop_cycles from anon;
revoke insert, update, delete on public.whoop_cycles from authenticated;
grant select on public.whoop_cycles to authenticated;

create table public.whoop_recoveries (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  raw jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
comment on table public.whoop_recoveries is 'WHOOP-Recovery (Score, HRV, Ruhepuls, SpO2) – normalisiert (data) und Rohdaten (raw)';
create index whoop_recoveries_user_updated_idx on public.whoop_recoveries (user_id, updated_at);
create trigger whoop_recoveries_set_updated_at before insert or update on public.whoop_recoveries
  for each row execute function public.set_updated_at();
alter table public.whoop_recoveries enable row level security;
alter table public.whoop_recoveries force row level security;
create policy "whoop_recoveries: eigene Zeilen lesen" on public.whoop_recoveries for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.whoop_recoveries from anon;
revoke insert, update, delete on public.whoop_recoveries from authenticated;
grant select on public.whoop_recoveries to authenticated;

create table public.whoop_sleeps (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  raw jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
comment on table public.whoop_sleeps is 'WHOOP-Schlaf inkl. Naps und Schlafbedarf – normalisiert (data) und Rohdaten (raw)';
create index whoop_sleeps_user_updated_idx on public.whoop_sleeps (user_id, updated_at);
create trigger whoop_sleeps_set_updated_at before insert or update on public.whoop_sleeps
  for each row execute function public.set_updated_at();
alter table public.whoop_sleeps enable row level security;
alter table public.whoop_sleeps force row level security;
create policy "whoop_sleeps: eigene Zeilen lesen" on public.whoop_sleeps for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.whoop_sleeps from anon;
revoke insert, update, delete on public.whoop_sleeps from authenticated;
grant select on public.whoop_sleeps to authenticated;

create table public.whoop_workouts (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  raw jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
comment on table public.whoop_workouts is 'WHOOP-Workouts – normalisiert (data) und Rohdaten (raw)';
create index whoop_workouts_user_updated_idx on public.whoop_workouts (user_id, updated_at);
create trigger whoop_workouts_set_updated_at before insert or update on public.whoop_workouts
  for each row execute function public.set_updated_at();
alter table public.whoop_workouts enable row level security;
alter table public.whoop_workouts force row level security;
create policy "whoop_workouts: eigene Zeilen lesen" on public.whoop_workouts for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.whoop_workouts from anon;
revoke insert, update, delete on public.whoop_workouts from authenticated;
grant select on public.whoop_workouts to authenticated;

create table public.whoop_body (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  raw jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
comment on table public.whoop_body is 'WHOOP-Körpermaße – normalisiert (data) und Rohdaten (raw)';
create index whoop_body_user_updated_idx on public.whoop_body (user_id, updated_at);
create trigger whoop_body_set_updated_at before insert or update on public.whoop_body
  for each row execute function public.set_updated_at();
alter table public.whoop_body enable row level security;
alter table public.whoop_body force row level security;
create policy "whoop_body: eigene Zeilen lesen" on public.whoop_body for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.whoop_body from anon;
revoke insert, update, delete on public.whoop_body from authenticated;
grant select on public.whoop_body to authenticated;

-- Manuelle Zuordnung Workout → Einheit (von der App geschrieben, synchronisiert wie die Tabellen aus Phase 4)
create table public.workout_assignments (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, workout_id)
);
create index workout_assignments_user_updated_idx on public.workout_assignments (user_id, updated_at);
create trigger workout_assignments_set_updated_at before insert or update on public.workout_assignments
  for each row execute function public.set_updated_at();
alter table public.workout_assignments enable row level security;
alter table public.workout_assignments force row level security;
create policy "workout_assignments: eigene Zeilen lesen" on public.workout_assignments for select to authenticated using (user_id = (select auth.uid()));
create policy "workout_assignments: eigene Zeilen anlegen" on public.workout_assignments for insert to authenticated with check (user_id = (select auth.uid()));
create policy "workout_assignments: eigene Zeilen ändern" on public.workout_assignments for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "workout_assignments: eigene Zeilen löschen" on public.workout_assignments for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.workout_assignments from anon;
grant select, insert, update, delete on public.workout_assignments to authenticated;
