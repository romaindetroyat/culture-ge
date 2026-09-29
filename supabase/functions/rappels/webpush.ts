// Envoi d'une notification Web Push (RFC 8291, chiffrement aes128gcm) signée VAPID (RFC 8292).
// Uniquement WebCrypto : fonctionne dans Deno (fonctions Supabase) comme dans Node 20+.

const encodeur = new TextEncoder();

export function b64url(octets) {
  let s = '';
  for (const o of new Uint8Array(octets)) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deB64url(texte) {
  const b = atob(texte.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((texte.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}

function concat(...parties) {
  const out = new Uint8Array(parties.reduce((t, p) => t + p.length, 0));
  let i = 0;
  for (const p of parties) { out.set(p, i); i += p.length; }
  return out;
}

async function hmac(cle, donnees) {
  const k = await crypto.subtle.importKey('raw', cle, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, donnees));
}

/** Chiffre `texte` pour l'abonné (clés p256dh et auth du navigateur). */
export async function chiffrer(texte, p256dh, auth, sel = crypto.getRandomValues(new Uint8Array(16))) {
  const cleClient = deB64url(p256dh);
  const secretAuth = deB64url(auth);
  const ephemere = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const clePubServeur = new Uint8Array(await crypto.subtle.exportKey('raw', ephemere.publicKey));
  const cleClientImportee = await crypto.subtle.importKey('raw', cleClient, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secretEcdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: cleClientImportee }, ephemere.privateKey, 256));

  const prkCle = await hmac(secretAuth, secretEcdh);
  const infoCle = concat(encodeur.encode('WebPush: info\0'), cleClient, clePubServeur, new Uint8Array([1]));
  const ikm = await hmac(prkCle, infoCle);
  const prk = await hmac(sel, ikm);
  const cek = (await hmac(prk, concat(encodeur.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(encodeur.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const clair = concat(encodeur.encode(texte), new Uint8Array([2])); // 2 : dernier (et unique) enregistrement
  const cleAes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cleAes, clair));

  const entete = new Uint8Array(21);
  entete.set(sel, 0);
  new DataView(entete.buffer).setUint32(16, 4096);
  entete[20] = clePubServeur.length;
  return concat(entete, clePubServeur, chiffre);
}

/** Jeton VAPID (JWT ES256) pour l'origine du service de notification. */
export async function jetonVapid(endpoint, clePrivee, contact) {
  const aud = new URL(endpoint).origin;
  const entete = b64url(encodeur.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corps = b64url(encodeur.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contact })));
  const cle = await crypto.subtle.importKey('jwk', clePrivee, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cle, encodeur.encode(`${entete}.${corps}`));
  return `${entete}.${corps}.${b64url(signature)}`;
}

/** Envoie la notification ; renvoie le code HTTP du service (201 = acceptée, 404/410 = abonnement expiré). */
export async function envoyer(abonne, message, vapid, ttl = 12 * 3600) {
  const corps = await chiffrer(JSON.stringify(message), abonne.p256dh, abonne.auth);
  const jeton = await jetonVapid(abonne.endpoint, vapid.privee, vapid.contact);
  const rep = await fetch(abonne.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: String(ttl),
      Urgency: 'normal',
      Authorization: `vapid t=${jeton}, k=${vapid.publique}`,
    },
    body: corps,
  });
  return rep.status;
}
