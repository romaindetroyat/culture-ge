# Serveur de la carte du jour (Supabase)

Projet Supabase `trivial-1000` (région Paris). Il sert à trois choses, sans compte utilisateur :

- **classement du jour** : chaque téléphone envoie son score anonymement (identifiant aléatoire) ;
- **groupes d'amis** : code de 6 lettres, classement de la semaine entre membres ;
- **rappels** : abonnements Web Push et envoi d'une notification à l'heure choisie.

Le navigateur n'accède jamais aux tables directement : il appelle les fonctions SQL de
`migrations/` (API REST `rpc/…` avec la clé publique). La soirée entre amis utilise seulement
Supabase Realtime (aucune table).

## Envoi des rappels

`pg_cron` appelle chaque heure la fonction `functions/rappels`, qui lit les abonnés dont c'est
l'heure (heure de Paris) et qui n'ont pas encore joué, puis leur envoie une notification chiffrée
(RFC 8291) et signée VAPID (RFC 8292), avec `webpush.ts` (WebCrypto, sans dépendance).
Les abonnements expirés sont supprimés.

Les secrets sont dans la table `parametres` (inaccessible depuis le navigateur) :
`vapid_publique`, `vapid_privee` (clé JWK), `vapid_contact` et `cle_cron` (protège l'appel horaire).
La clé publique VAPID est aussi dans `app/quotidien.js`. Pour changer de clés, en générer une
nouvelle paire P-256, mettre à jour ces deux endroits : les abonnés devront réactiver le rappel.

## Déployer

```sh
supabase link --project-ref udreqtxyvafojqefmkmt
supabase db push
supabase functions deploy rappels --no-verify-jwt
```
