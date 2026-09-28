-- Collectr: Push-Erinnerungen versenden (Phase 7), alle 5 Minuten.
-- Voraussetzung: supabase/sql/cron.sql wurde ausgeführt (pg_cron, pg_net und das Vault-Secret collectr_cron_secret existieren).
-- <PROJEKT-REF> ersetzen, dann im Supabase SQL Editor ausführen.

select cron.schedule(
  'collectr-push',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJEKT-REF>.supabase.co/functions/v1/push-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collectr_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Versandprotokoll klein halten: täglich Einträge älter als 30 Tage löschen
select cron.schedule('collectr-push-aufraeumen', '17 3 * * *', $$ delete from public.push_sent where sent_at < now() - interval '30 days' $$);

-- Kontrolle: select * from cron.job;   Entfernen: select cron.unschedule('collectr-push'); select cron.unschedule('collectr-push-aufraeumen');
