-- Collectr: Live-Aktualisierung (Phase 6)
-- Ändert sich der WHOOP-Status (neuer Abruf per Webhook oder Zeitplan), erfährt die geöffnete App
-- das über Supabase Realtime und synchronisiert sofort. RLS gilt auch für Realtime.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.whoop_status;
  end if;
end
$$;
