-- Carte du jour jouée en retard : possible pendant toute la semaine en cours (du lundi à aujourd'hui,
-- heure de Paris ; la veille reste acceptée le lundi). Le classement d'un groupe donne aussi le
-- détail jour par jour, en signalant les cartes jouées en retard.

-- Numéro de la carte du lundi de la semaine en cours.
create function public.lundi_courant() returns int
language sql stable set search_path = '' as $$
  select public.jour_courant() - (extract(isodow from (now() at time zone 'Europe/Paris')::date)::int - 1)
$$;

create or replace function public.publier_resultat(p_joueur uuid, p_jour int, p_bonnes int, p_points int, p_res text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_jour not between least(public.lundi_courant(), public.jour_courant() - 1) and public.jour_courant() + 1 then
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

create or replace function public.classement_groupe(p_code text, p_joueur uuid, p_du int, p_au int) returns jsonb
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
                 from public.resultats_jour r where r.joueur = m.joueur and r.jour = p_au),
        -- Jour par jour : retard = carte jouée après son jour (heure de Paris).
        'jours', coalesce((select jsonb_agg(jsonb_build_object(
                   'jour', r.jour, 'bonnes', r.bonnes, 'points', r.points,
                   'retard', (r.cree at time zone 'Europe/Paris')::date > date '2026-09-27' + r.jour) order by r.jour)
                 from public.resultats_jour r where r.joueur = m.joueur and r.jour between p_du and p_au), '[]'::jsonb)
      ) order by coalesce(s.points, 0) desc, m.nom)
      from public.membres m
      left join lateral (
        select sum(r.points)::int points, sum(r.bonnes)::int bonnes, count(*)::int joues
        from public.resultats_jour r where r.joueur = m.joueur and r.jour between p_du and p_au
      ) s on true
      where m.code = g.code), '[]'::jsonb))
  from public.groupes g where g.code = p_code) end
$$;

revoke execute on function public.lundi_courant() from public, anon, authenticated;
grant execute on function public.lundi_courant() to anon, authenticated;
