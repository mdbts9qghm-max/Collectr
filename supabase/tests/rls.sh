#!/usr/bin/env bash
# Testet Migration und Row Level Security mit einem temporären lokalen Postgres.
# Supabase-Bestandteile (auth.users, auth.uid(), Rollen anon/authenticated) werden nachgebildet.
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
DIR=$(mktemp -d)
PORT=${PGPORT_TEST:-54329}
cleanup() { "$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
RUNAS=()
if [ "$(id -u)" = "0" ]; then
  id pgtest >/dev/null 2>&1 || useradd -M pgtest
  chown -R pgtest "$DIR"
  RUNAS=(runuser -u pgtest --)
fi
"${RUNAS[@]}" "$PGBIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" <<'SQL'
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
SQL
"${PSQL[@]}" -f supabase/migrations/20261001000000_init.sql

"${PSQL[@]}" <<'SQL'
-- Nutzer A schreibt
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into public.session_logs (session_id, data) values ('2026-10-03#lauf', '{"status":"done"}');
insert into public.shift_overrides (date, data) values ('2026-10-06', '{"kind":"V"}');
do $$ begin
  if (select count(*) from public.session_logs) <> 1 then raise exception 'A sieht eigene Zeile nicht'; end if;
  if (select updated_at from public.session_logs limit 1) is null then raise exception 'updated_at fehlt'; end if;
  if (select user_id from public.session_logs limit 1) <> '00000000-0000-0000-0000-00000000000a' then raise exception 'user_id nicht gesetzt'; end if;
end $$;
-- A darf keine Zeile für B anlegen
do $$ begin
  begin
    insert into public.session_logs (user_id, session_id, data) values ('00000000-0000-0000-0000-00000000000b', 'x', '{}');
    raise exception 'A konnte Zeile für B anlegen';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Nutzer B sieht und ändert nichts von A
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  if (select count(*) from public.session_logs) <> 0 then raise exception 'B sieht Zeilen von A'; end if;
end $$;
update public.session_logs set deleted = true;
delete from public.shift_overrides;

-- anon sieht nichts
reset request.jwt.claim.sub;
set role anon;
do $$ begin
  begin
    perform count(*) from public.session_logs;
    raise exception 'anon darf lesen';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A: Daten unverändert, updated_at steigt bei Änderung
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$
declare before timestamptz;
begin
  if (select deleted from public.session_logs) then raise exception 'B hat Zeile von A geändert'; end if;
  if (select count(*) from public.shift_overrides) <> 1 then raise exception 'B hat Zeile von A gelöscht'; end if;
  select updated_at into before from public.session_logs;
  perform pg_sleep(0.01);
  update public.session_logs set data = '{"status":"skipped"}';
  if (select updated_at from public.session_logs) <= before then raise exception 'updated_at nicht aktualisiert'; end if;
end $$;
SQL
# Alle Tabellen: RLS aktiv + erzwungen, je 4 Policies, anon ohne Rechte
"${PSQL[@]}" <<'SQL'
do $$
declare t record;
begin
  for t in select c.relname, c.relrowsecurity, c.relforcerowsecurity,
                  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as n,
                  has_table_privilege('anon', c.oid, 'select') as anon_select
           from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
           where ns.nspname = 'public' and c.relkind = 'r'
  loop
    if not t.relrowsecurity or not t.relforcerowsecurity then raise exception 'RLS fehlt auf %', t.relname; end if;
    if t.n <> 4 then raise exception '% hat % statt 4 Policies', t.relname, t.n; end if;
    if t.anon_select then raise exception 'anon darf % lesen', t.relname; end if;
  end loop;
  if (select count(*) from pg_class c join pg_namespace ns on ns.oid = c.relnamespace where ns.nspname = 'public' and c.relkind = 'r') <> 8 then
    raise exception 'erwartet 8 Tabellen';
  end if;
end $$;
SQL
echo "RLS-Tests: alle bestanden (8 Tabellen, Isolation A/B, anon gesperrt, updated_at)."
