-- Collectr: Push-Erinnerungen (Phase 7)
-- Die App legt ihre Abos und die geplanten Erinnerungen (30 min vor Schlaf/Nap) an.
-- Versendet werden sie von der Edge Function push-send (Service Role, pg_cron alle 5 min).

create table public.push_subscriptions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);
comment on table public.push_subscriptions is 'Web-Push-Abos je Gerät';
alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;
create policy "push_subscriptions: eigene Zeilen lesen" on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "push_subscriptions: eigene Zeilen anlegen" on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "push_subscriptions: eigene Zeilen ändern" on public.push_subscriptions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "push_subscriptions: eigene Zeilen löschen" on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create table public.push_reminders (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  due_at timestamptz not null,
  title text not null,
  body text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
comment on table public.push_reminders is 'Geplante Erinnerungen (von der App berechnet)';
create index push_reminders_due_idx on public.push_reminders (due_at);
create trigger push_reminders_set_updated_at before insert or update on public.push_reminders
  for each row execute function public.set_updated_at();
alter table public.push_reminders enable row level security;
alter table public.push_reminders force row level security;
create policy "push_reminders: eigene Zeilen lesen" on public.push_reminders for select to authenticated using (user_id = (select auth.uid()));
create policy "push_reminders: eigene Zeilen anlegen" on public.push_reminders for insert to authenticated with check (user_id = (select auth.uid()));
create policy "push_reminders: eigene Zeilen ändern" on public.push_reminders for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "push_reminders: eigene Zeilen löschen" on public.push_reminders for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.push_reminders from anon;
grant select, insert, update, delete on public.push_reminders to authenticated;

-- Versandprotokoll: nur Service Role. Schlüssel enthält die Fälligkeit, damit eine verschobene
-- Erinnerung (z. B. nach neuer V-Schicht) wieder gesendet werden kann.
create table public.push_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  reminder_id text not null,
  due_at timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, reminder_id, due_at)
);
comment on table public.push_sent is 'Gesendete Erinnerungen – nur serverseitig';
alter table public.push_sent enable row level security;
alter table public.push_sent force row level security;
revoke all on public.push_sent from anon, authenticated;

-- Ersetzt die zukünftigen Erinnerungen des angemeldeten Nutzers in einem Schritt (RLS gilt).
-- items: [{ "id": "...", "due_at": "...", "title": "...", "body": "..." }]
create or replace function public.replace_push_reminders(items jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.push_reminders
   where user_id = (select auth.uid())
     and (due_at > now() or due_at < now() - interval '2 days')
     and id not in (select x->>'id' from jsonb_array_elements(items) x);
  insert into public.push_reminders (id, due_at, title, body)
  select x->>'id', (x->>'due_at')::timestamptz, x->>'title', x->>'body' from jsonb_array_elements(items) x
  on conflict (user_id, id) do update
    set due_at = excluded.due_at, title = excluded.title, body = excluded.body
    where public.push_reminders.due_at is distinct from excluded.due_at
       or public.push_reminders.title is distinct from excluded.title
       or public.push_reminders.body is distinct from excluded.body;
$$;
revoke all on function public.replace_push_reminders(jsonb) from public, anon;
grant execute on function public.replace_push_reminders(jsonb) to authenticated;
