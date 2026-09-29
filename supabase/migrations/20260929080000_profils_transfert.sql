-- Profil d'un joueur, pour passer de Safari à l'appli installée ou changer de téléphone :
-- un code de transfert (secret) donne accès à l'identifiant et aux données sauvegardées.

create table public.profils (
  joueur uuid primary key,
  code text not null unique check (code ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$'),
  donnees jsonb not null default '{}'::jsonb check (pg_column_size(donnees) < 20000),
  maj timestamptz not null default now()
);
alter table public.profils enable row level security;
revoke all on public.profils from anon, authenticated;

-- Code de transfert du joueur (créé à la première demande).
create function public.code_profil(p_joueur uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_code text;
  lettres constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  select code into v_code from public.profils where joueur = p_joueur;
  if found then return v_code; end if;
  loop
    select string_agg(substr(lettres, 1 + floor(random() * length(lettres))::int, 1), '') into v_code from generate_series(1, 8);
    v_code := substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);
    exit when not exists (select 1 from public.profils where code = v_code);
  end loop;
  insert into public.profils (joueur, code) values (p_joueur, v_code);
  return v_code;
end $$;

-- Sauvegarde des données propres au téléphone (prénom, records…).
create function public.sauver_profil(p_joueur uuid, p_donnees jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.code_profil(p_joueur);
  update public.profils set donnees = p_donnees, maj = now() where joueur = p_joueur;
end $$;

-- Tout ce qu'il faut pour reconstituer le profil sur un autre écran.
create function public.contenu_profil(p_joueur uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'joueur', p_joueur,
    'code', (select code from public.profils where joueur = p_joueur),
    'donnees', coalesce((select donnees from public.profils where joueur = p_joueur), '{}'::jsonb),
    'resultats', coalesce((select jsonb_agg(jsonb_build_object('jour', jour, 'points', points, 'res', res) order by jour)
                           from public.resultats_jour where joueur = p_joueur), '[]'::jsonb),
    'groupes', public.mes_groupes(p_joueur))
$$;

-- Récupération par le code de transfert (tirets et casse indifférents).
create function public.recuperer_profil(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.contenu_profil(joueur) from public.profils
  where code = upper(substr(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'), 1, 4) || '-' || substr(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'), 5, 4))
$$;

-- Récupération par l'identifiant (retrouvé dans un cookie).
create function public.profil_joueur(p_joueur uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.contenu_profil(p_joueur)
$$;

revoke execute on function public.code_profil(uuid), public.sauver_profil(uuid, jsonb), public.contenu_profil(uuid),
  public.recuperer_profil(text), public.profil_joueur(uuid) from public, anon, authenticated;
grant execute on function public.code_profil(uuid), public.sauver_profil(uuid, jsonb),
  public.recuperer_profil(text), public.profil_joueur(uuid) to anon, authenticated;
