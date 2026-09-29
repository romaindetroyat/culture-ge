-- Carte du jour : résultats anonymes, groupes d'amis, abonnements aux notifications.
-- Aucun accès direct aux tables depuis le navigateur : tout passe par les fonctions ci-dessous.

create table public.resultats_jour (
  jour int not null,
  joueur uuid not null,
  bonnes smallint not null check (bonnes between 0 and 6),
  points smallint not null check (points between 0 and 30),
  res text not null check (res ~ '^[01]{6}$'),
  cree timestamptz not null default now(),
  primary key (jour, joueur)
);
create index resultats_jour_joueur on public.resultats_jour (joueur, jour);

create table public.groupes (
  code text primary key,
  nom text not null check (char_length(nom) between 1 and 40),
  cree timestamptz not null default now()
);

create table public.membres (
  code text not null references public.groupes (code) on delete cascade,
  joueur uuid not null,
  nom text not null check (char_length(nom) between 1 and 20),
  rejoint timestamptz not null default now(),
  primary key (code, joueur)
);
create index membres_joueur on public.membres (joueur);

create table public.abonnements (
  endpoint text primary key check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  heure smallint not null check (heure between 0 and 23),
  joueur uuid,
  dernier_envoi int,
  cree timestamptz not null default now()
);
create index abonnements_heure on public.abonnements (heure);

create table public.parametres (
  cle text primary key,
  valeur text not null
);

alter table public.resultats_jour enable row level security;
alter table public.groupes enable row level security;
alter table public.membres enable row level security;
alter table public.abonnements enable row level security;
alter table public.parametres enable row level security;
revoke all on public.resultats_jour, public.groupes, public.membres, public.abonnements, public.parametres from anon, authenticated;

-- Numéro de la carte du jour à Paris (n°1 = 28 septembre 2026).
create function public.jour_courant() returns int
language sql stable set search_path = '' as $$
  select ((now() at time zone 'Europe/Paris')::date - date '2026-09-28') + 1
$$;

-- Statistiques d'une journée : répartition des scores et position du joueur.
create function public.stats_jour(p_jour int, p_joueur uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with r as (select * from public.resultats_jour where jour = p_jour),
  moi as (select * from r where joueur = p_joueur)
  select jsonb_build_object(
    'jour', p_jour,
    'total', (select count(*) from r),
    'repartition', (select jsonb_agg(coalesce((select count(*) from r where bonnes = b), 0) order by b) from generate_series(0, 6) b),
    'moyenne', (select round(avg(bonnes)::numeric, 2) from r),
    'moi', (select jsonb_build_object('bonnes', bonnes, 'points', points) from moi),
    'moins_bien', (select count(*) from r, moi where r.points < moi.points),
    'pareil', (select count(*) - 1 from r, moi where r.points = moi.points)
  )
$$;

-- Enregistre le résultat du jour (une seule fois par joueur) et renvoie les statistiques.
create function public.publier_resultat(p_joueur uuid, p_jour int, p_bonnes int, p_points int, p_res text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_jour not between public.jour_courant() - 1 and public.jour_courant() + 1 then
    raise exception 'jour hors délai';
  end if;
  if length(replace(p_res, '0', '')) <> p_bonnes then
    raise exception 'résultat incohérent';
  end if;
  insert into public.resultats_jour (jour, joueur, bonnes, points, res)
  values (p_jour, p_joueur, p_bonnes, p_points, p_res)
  on conflict do nothing;
  return public.stats_jour(p_jour, p_joueur);
end $$;

-- Groupes d'amis : code de 6 lettres, classement de la semaine.
create function public.creer_groupe(p_nom text, p_joueur uuid, p_pseudo text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_code text;
  lettres constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ';
begin
  if (select count(*) from public.membres where joueur = p_joueur) >= 20 then
    raise exception 'trop de groupes';
  end if;
  loop
    select string_agg(substr(lettres, 1 + floor(random() * length(lettres))::int, 1), '') into v_code from generate_series(1, 6);
    exit when not exists (select 1 from public.groupes where code = v_code);
  end loop;
  insert into public.groupes (code, nom) values (v_code, left(btrim(p_nom), 40));
  insert into public.membres (code, joueur, nom) values (v_code, p_joueur, left(btrim(p_pseudo), 20));
  return jsonb_build_object('code', v_code, 'nom', left(btrim(p_nom), 40));
end $$;

create function public.rejoindre_groupe(p_code text, p_joueur uuid, p_pseudo text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  g public.groupes;
begin
  select * into g from public.groupes where code = upper(btrim(p_code));
  if not found then return null; end if;
  if not exists (select 1 from public.membres where code = g.code and joueur = p_joueur)
     and (select count(*) from public.membres where code = g.code) >= 200 then
    raise exception 'groupe complet';
  end if;
  insert into public.membres (code, joueur, nom) values (g.code, p_joueur, left(btrim(p_pseudo), 20))
  on conflict (code, joueur) do update set nom = excluded.nom;
  return jsonb_build_object('code', g.code, 'nom', g.nom);
end $$;

create function public.quitter_groupe(p_code text, p_joueur uuid) returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.membres where code = p_code and joueur = p_joueur;
  delete from public.groupes g where g.code = p_code and not exists (select 1 from public.membres m where m.code = g.code);
$$;

create function public.mes_groupes(p_joueur uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', g.code, 'nom', g.nom, 'pseudo', m.nom) order by m.rejoint), '[]'::jsonb)
  from public.membres m join public.groupes g using (code)
  where m.joueur = p_joueur
$$;

-- Classement d'un groupe entre deux jours (inclus) ; réservé à ses membres.
create function public.classement_groupe(p_code text, p_joueur uuid, p_du int, p_au int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not exists (select 1 from public.membres where code = p_code and joueur = p_joueur) then null else
  (select jsonb_build_object(
    'code', g.code, 'nom', g.nom,
    'membres', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nom', m.nom,
        'moi', m.joueur = p_joueur,
        'points', coalesce(s.points, 0),
        'bonnes', coalesce(s.bonnes, 0),
        'joues', coalesce(s.joues, 0),
        'jour', (select jsonb_build_object('bonnes', r.bonnes, 'points', r.points, 'res', r.res)
                 from public.resultats_jour r where r.joueur = m.joueur and r.jour = p_au)
      ) order by coalesce(s.points, 0) desc, m.nom)
      from public.membres m
      left join lateral (
        select sum(r.points)::int points, sum(r.bonnes)::int bonnes, count(*)::int joues
        from public.resultats_jour r where r.joueur = m.joueur and r.jour between p_du and p_au
      ) s on true
      where m.code = g.code), '[]'::jsonb))
  from public.groupes g where g.code = p_code) end
$$;

-- Notifications : abonnement et désabonnement (l'adresse d'envoi, secrète, sert d'identifiant).
create function public.s_abonner(p_endpoint text, p_p256dh text, p_auth text, p_heure int, p_joueur uuid) returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.abonnements (endpoint, p256dh, auth, heure, joueur)
  values (p_endpoint, p_p256dh, p_auth, p_heure, p_joueur)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, heure = excluded.heure, joueur = excluded.joueur;
$$;

create function public.se_desabonner(p_endpoint text) returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.abonnements where endpoint = p_endpoint;
$$;

-- Abonnés à prévenir à cette heure (heure de Paris) ; marque l'envoi du jour.
-- Ceux qui ont déjà joué la carte du jour ne sont pas dérangés.
create function public.rappels_a_envoyer(p_heure int) returns table (endpoint text, p256dh text, auth text, jour int, serie int)
language plpgsql volatile security definer set search_path = '' as $$
declare
  j int := public.jour_courant();
begin
  return query
  update public.abonnements a set dernier_envoi = j
  where a.heure = p_heure and (a.dernier_envoi is null or a.dernier_envoi < j)
    and not exists (select 1 from public.resultats_jour r where r.joueur = a.joueur and r.jour = j)
  returning a.endpoint, a.p256dh, a.auth, j,
    (select count(*)::int from (
       select r.jour, row_number() over (order by r.jour desc) rn
       from public.resultats_jour r where r.joueur = a.joueur and r.jour < j
     ) t where t.jour = j - t.rn::int);
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.jour_courant(), public.stats_jour(int, uuid), public.publier_resultat(uuid, int, int, int, text),
  public.creer_groupe(text, uuid, text), public.rejoindre_groupe(text, uuid, text), public.quitter_groupe(text, uuid),
  public.mes_groupes(uuid), public.classement_groupe(text, uuid, int, int),
  public.s_abonner(text, text, text, int, uuid), public.se_desabonner(text)
to anon, authenticated;
