// Rappels de la carte du jour : appelée chaque heure par pg_cron (voir supabase/migrations),
// elle envoie une notification aux abonnés dont c'est l'heure et qui n'ont pas encore joué.
// Appelée depuis l'application avec { essai: endpoint }, elle envoie une notification de
// confirmation à un abonnement créé il y a moins de 5 minutes.

import postgres from 'npm:postgres@3.4.5';
import { envoyer } from './webpush.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL'), { prepare: false, max: 3 });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
};

function reponse(corps, statut = 200) {
  return new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function parametres() {
  const lignes = await sql`select cle, valeur from public.parametres`;
  return Object.fromEntries(lignes.map(l => [l.cle, l.valeur]));
}

function message(jour, serie) {
  return {
    titre: `🎯 Carte du jour n°${jour}`,
    corps: serie > 0
      ? `🔥 ${serie} jour${serie > 1 ? 's' : ''} d'affilée : 6 nouvelles questions pour prolonger la série !`
      : 'Six nouvelles questions, une par couleur. La même carte pour tout le monde : à vous de jouer !',
    url: './?jour',
    tag: 'carte-du-jour',
  };
}

async function expedier(abonnes, vapid, fabriquer) {
  const bilan = { envoyees: 0, expirees: 0, erreurs: 0 };
  // Par petits lots pour ne pas ouvrir trop de connexions à la fois.
  for (let i = 0; i < abonnes.length; i += 20) {
    await Promise.all(abonnes.slice(i, i + 20).map(async a => {
      try {
        const statut = await envoyer(a, fabriquer(a), vapid);
        if (statut === 404 || statut === 410) {
          bilan.expirees++;
          await sql`delete from public.abonnements where endpoint = ${a.endpoint}`;
        } else if (statut >= 200 && statut < 300) bilan.envoyees++;
        else { bilan.erreurs++; console.error('refus', statut, new URL(a.endpoint).host); }
      } catch (err) {
        bilan.erreurs++;
        console.error('échec', err.message);
      }
    }));
  }
  return bilan;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return reponse({ erreur: 'méthode' }, 405);
  const corps = await req.json().catch(() => ({}));
  const p = await parametres();
  const vapid = { publique: p.vapid_publique, privee: JSON.parse(p.vapid_privee), contact: p.vapid_contact };

  if (typeof corps.essai === 'string') {
    const abonnes = await sql`
      select endpoint, p256dh, auth from public.abonnements
      where endpoint = ${corps.essai} and cree > now() - interval '5 minutes'`;
    if (!abonnes.length) return reponse({ erreur: 'abonnement inconnu' }, 404);
    const heure = (await sql`select heure from public.abonnements where endpoint = ${corps.essai}`)[0].heure;
    const bilan = await expedier(abonnes, vapid, () => ({
      titre: '🔔 Rappel activé',
      corps: `Vous serez prévenu chaque jour vers ${heure} h quand une nouvelle carte du jour vous attend.`,
      url: './?jour',
      tag: 'rappel-active',
    }));
    return reponse(bilan);
  }

  if (req.headers.get('x-cle') !== p.cle_cron) return reponse({ erreur: 'non autorisé' }, 401);
  const heure = Number.isInteger(corps.heure)
    ? corps.heure
    : Number(new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Paris' }).format(new Date()));
  const abonnes = await sql`select * from public.rappels_a_envoyer(${heure})`;
  const bilan = await expedier(abonnes, vapid, a => message(a.jour, a.serie));
  console.log('rappels', heure, 'h', abonnes.length, 'abonnés', JSON.stringify(bilan));
  return reponse({ heure, abonnes: abonnes.length, ...bilan });
});
