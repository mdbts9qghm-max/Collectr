-- Collectr: täglicher WHOOP-Abruf im Hintergrund (Phase 6, Rückfallebene zu den Webhooks)
-- Einmalig im Supabase SQL Editor ausführen. Vorher unter Database → Extensions „pg_cron“ und „pg_net“ aktivieren.
-- <PROJEKT-REF> und <CRON-SECRET> ersetzen. Das Secret landet im Vault, nicht in der Zeitplan-Definition.

-- 1. Secret im Vault ablegen (derselbe Wert wie das Function-Secret CRON_SECRET)
select vault.create_secret('<CRON-SECRET>', 'collectr_cron_secret', 'Secret für whoop-sync-all');

-- 2. Zeitplan (pg_cron rechnet in UTC):
--    07:30 UTC = 09:30 Uhr Sommerzeit / 08:30 Uhr Winterzeit (nach dem Nachtschlaf)
--    13:30 UTC = 15:30 Uhr Sommerzeit / 14:30 Uhr Winterzeit (nach dem Tagschlaf nach der Nachtschicht)
select cron.schedule(
  'collectr-whoop-morgens',
  '30 7 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJEKT-REF>.supabase.co/functions/v1/whoop-sync-all',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collectr_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'collectr-whoop-nachmittags',
  '30 13 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJEKT-REF>.supabase.co/functions/v1/whoop-sync-all',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collectr_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Kontrolle: select * from cron.job;   Letzte Läufe: select * from cron.job_run_details order by start_time desc limit 10;
-- Entfernen: select cron.unschedule('collectr-whoop-morgens'); select cron.unschedule('collectr-whoop-nachmittags');
