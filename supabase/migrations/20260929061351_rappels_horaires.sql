create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Chaque heure pile : la fonction « rappels » prévient les abonnés dont c'est l'heure (heure de Paris).
select cron.schedule(
  'rappels-carte-du-jour',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://udreqtxyvafojqefmkmt.supabase.co/functions/v1/rappels',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cle', (select valeur from public.parametres where cle = 'cle_cron')),
    body := jsonb_build_object('heure', extract(hour from now() at time zone 'Europe/Paris')::int),
    timeout_milliseconds := 30000
  );
  $$
);
